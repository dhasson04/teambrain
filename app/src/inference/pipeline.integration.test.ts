// T004 / R004: end-to-end integration test against the real Fixture A vault
// and a running local Ollama at 127.0.0.1:11434. Skips with a clear message
// when either precondition (Ollama reachable, Fixture A present) is not met,
// so `bun test` remains green in environments without a local model.
//
// The test asserts the chain R001 -> R002 -> R005 is actually wired end-to-
// end: after T002 enum-pins dump_id at the sampler, the render actually
// writes latest.md, and the retrieval-at-render block (R005) causes at least
// one multi-word substring that exists ONLY in materials/problem.md (never
// in any dump) to surface in the rendered synthesis body. Before this
// frontier, every gemma3 render failed on author-mismatch complaints so
// latest.md never got written, and no substring assertion was even
// observable — catching the full regression requires running real inference.
//
// Scope: reads the on-disk Fixture A at C:/dev/teambrain/app/vault/projects/
// acme-q2-onboarding/subprojects/funnel-investigation. Work happens on a
// tmpdir copy so running the test never mutates the developer's real vault.
//
// Invocation: `bun run test:integration` (package.json script).

import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadConfig, resetConfigCache } from "../server/config";
import { listDumps } from "../vault/dumps";
import type { DumpHashEntry } from "../vault/synthesis";
import { InferenceService } from "./inference-service";
import { PromptRegistry } from "./prompt-registry";
import { renderSynthesis } from "./renderer";

const OLLAMA_URL = "http://127.0.0.1:11434";
const FIXTURE_PROJECT = "acme-q2-onboarding";
const FIXTURE_SUB = "funnel-investigation";
const PROMPTS_DIR = resolve(__dirname, "..", "..", "..", "prompts");

/**
 * The Fixture A vault is gitignored, so it only exists where the dev
 * originally created it. When running from a forge worktree, app/vault/
 * may not exist — fall through to the main checkout's app/vault. Skip the
 * test if neither location has the fixture subproject.
 */
function resolveFixtureVault(): string | null {
  const candidates = [
    resolve(__dirname, "..", "..", "vault"),
    resolve(__dirname, "..", "..", "..", "..", "teambrain", "app", "vault"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "projects", FIXTURE_PROJECT, "subprojects", FIXTURE_SUB, "problem.md"))) {
      return c;
    }
  }
  return null;
}

/**
 * Probe the local Ollama /api/tags endpoint with a short timeout. Returns
 * true iff the daemon is reachable and responsive; any network error,
 * non-200, or timeout resolves false so the test can skip cleanly.
 */
async function ollamaReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function fixturePresent(vault: string): Promise<boolean> {
  try {
    const sub = join(vault, "projects", FIXTURE_PROJECT, "subprojects", FIXTURE_SUB);
    const entries = await readdir(sub);
    return entries.includes("materials") && entries.includes("dumps") && entries.includes("problem.md") && entries.includes("ideas");
  } catch {
    return false;
  }
}

/**
 * Read every file under `materials/` and `problem.md`, flatten to a single
 * text blob. Caller mines this for distinctive substrings.
 */
async function readMaterialsCorpus(vault: string, project: string, sub: string): Promise<string> {
  const base = join(vault, "projects", project, "subprojects", sub);
  const pieces: string[] = [];
  pieces.push(await readFile(join(base, "problem.md"), "utf8"));
  const matDir = join(base, "materials");
  const matFiles = await readdir(matDir);
  for (const f of matFiles) {
    if (f.endsWith(".md")) pieces.push(await readFile(join(matDir, f), "utf8"));
  }
  return pieces.join("\n");
}

async function readDumpsCorpus(vault: string, project: string, sub: string): Promise<string> {
  const dumpsDir = join(vault, "projects", project, "subprojects", sub, "dumps");
  const files = await readdir(dumpsDir);
  const pieces: string[] = [];
  for (const f of files) {
    if (f.endsWith(".md")) pieces.push(await readFile(join(dumpsDir, f), "utf8"));
  }
  return pieces.join("\n");
}

/**
 * Pick multi-word substrings that appear in the materials corpus but never
 * in any dump. These are the phrases that could ONLY end up in the
 * rendered body via the R005 retrieval-at-render path.
 */
function materialOnlySubstrings(materials: string, dumps: string): string[] {
  const candidates = [
    "Pre-redesign baseline",
    "41% completion",
    "Q1 conversion drop kickoff",
    "Attendees: Alice (PM), Bob (Eng)",
    "statistically meaningful within 2 weeks",
    "Carol to mock the soft path",
    "2026-02-26 to leave headroom",
    "show value first",
    "visual weight of the credit-card form",
  ];
  return candidates.filter((s) => materials.includes(s) && !dumps.includes(s));
}

let ollamaUp = false;
let fixtureOk = false;
let fixtureVault: string | null = null;
let tmpVault = "";

beforeAll(async () => {
  ollamaUp = await ollamaReachable();
  fixtureVault = resolveFixtureVault();
  fixtureOk = fixtureVault !== null && (await fixturePresent(fixtureVault));
  if (!ollamaUp) {
    // eslint-disable-next-line no-console
    console.warn(`[pipeline.integration] Ollama at ${OLLAMA_URL} unreachable; skipping integration test`);
  }
  if (!fixtureOk) {
    // eslint-disable-next-line no-console
    console.warn(`[pipeline.integration] Fixture A not found at any known vault location; skipping integration test`);
  }
  if (ollamaUp && fixtureOk && fixtureVault) {
    // Copy the fixture into a tmpdir so the test never mutates the dev's vault.
    tmpVault = await mkdtemp(join(tmpdir(), "teambrain-itest-"));
    await cp(fixtureVault, tmpVault, { recursive: true });
    process.env["TEAMBRAIN_VAULT"] = tmpVault;
    resetConfigCache();
  }
});

describe("pipeline integration (real Ollama, Fixture A)", () => {
  test("renderSynthesis writes latest.md and surfaces a material-only substring", async () => {
    if (!ollamaUp || !fixtureOk || !fixtureVault) {
      // eslint-disable-next-line no-console
      console.warn("[pipeline.integration] precondition missing -> skipping assertion body");
      return;
    }
    // Sanity: the config we derive from env must agree with what the renderer
    // will see, and we need a registry rooted at the repo prompts/ dir.
    const cfg = loadConfig(true);
    expect(cfg.vault).toBe(tmpVault);
    const registry = new PromptRegistry({ promptsDir: PROMPTS_DIR });
    await registry.load();
    const service = new InferenceService({ registry, ollama_url: OLLAMA_URL });

    // Mine material-only substrings from the ORIGINAL fixture (not the tmp
    // copy — the content is identical but we want this check to be a stable
    // property of Fixture A regardless of tmp scaffolding).
    const materials = await readMaterialsCorpus(fixtureVault, FIXTURE_PROJECT, FIXTURE_SUB);
    const dumps = await readDumpsCorpus(fixtureVault, FIXTURE_PROJECT, FIXTURE_SUB);
    const materialOnly = materialOnlySubstrings(materials, dumps);
    expect(materialOnly.length).toBeGreaterThan(0);

    // Build DumpHashEntry[] from the tmp vault.
    const allDumps = await listDumps(FIXTURE_PROJECT, FIXTURE_SUB, { includeBody: false });
    const inputs: DumpHashEntry[] = allDumps.map((d) => ({ dump_id: d.id, hash: d.hash }));
    expect(inputs.length).toBeGreaterThan(0);

    const result = await renderSynthesis({
      service,
      project: FIXTURE_PROJECT,
      sub: FIXTURE_SUB,
      modelName: cfg.model_default,
      inputs,
    });

    // R004 core assertion: render actually produced a valid body. Before
    // this frontier, the author-mismatch branch killed every attempt.
    expect(result.ok).toBe(true);
    expect(result.body.length).toBeGreaterThan(0);
    expect(result.body).toContain("## Agreed");
    expect(result.body).toContain("## Disputed");
    expect(result.body).toContain("## Move forward");

    // R005 evidence: at least one distinctive substring that exists ONLY in
    // materials/problem.md — never in any dump — surfaces in the rendered
    // body. This can only happen via retrieval-at-render.
    const hit = materialOnly.find((s) => result.body.includes(s));
    expect(hit, `rendered body contained none of the material-only substrings: ${materialOnly.join(" | ")}`).toBeDefined();
  }, 180_000);
});

// Best-effort cleanup of the tmp vault so the integration suite leaves no
// litter behind. `bun:test` runs afterAll even when the describe block is
// short-circuited.
import { afterAll } from "bun:test";
afterAll(async () => {
  if (tmpVault) {
    try {
      await rm(tmpVault, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});
