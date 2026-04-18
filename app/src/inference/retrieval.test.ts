import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVaultPath } from "../vault/fs-utils";
import { initVault } from "../vault/init";
import { addMaterial, writeProblem } from "../vault/materials";
import { addProfile, makeProfile } from "../vault/profiles";
import { createProject } from "../vault/projects";
import { createSubproject } from "../vault/subprojects";
import { formatProjectContextBlock, indexMaterials, retrieveForRender } from "./retrieval";

let dir: string;
let originalVault: string | undefined;
let embeddingsAvailable = false;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "teambrain-retr-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = dir;
  await initVault();
  await addProfile(makeProfile({ id: "alice", display_name: "Alice" }));
  await createProject("Acme");
  await createSubproject("acme", "Q2");
  try {
    const { embed } = await import("./embeddings");
    await embed(["probe"]);
    embeddingsAvailable = true;
  } catch {
    embeddingsAvailable = false;
  }
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(dir, { recursive: true, force: true });
});

describe("indexMaterials", () => {
  test("builds an index from problem.md + materials", async () => {
    if (!embeddingsAvailable) return;
    await writeProblem("acme", "q2", "We ship v2 by May 1. Legal deadline is May 15.", "alice");
    await addMaterial(
      "acme",
      "q2",
      "kickoff.md",
      "Marketing launch budget locked with partner agencies. Rafal Industries has a May 3 dependency.",
      "alice",
    );
    const idx = await indexMaterials("acme", "q2");
    expect(idx.chunks.length).toBeGreaterThanOrEqual(2);
    expect(idx.chunks.some((c) => c.source === "problem.md")).toBe(true);
    expect(idx.chunks.some((c) => c.source.startsWith("materials/"))).toBe(true);
  });

  test("reuses prior embeddings when mtime + text unchanged", async () => {
    if (!embeddingsAvailable) return;
    await writeProblem("acme", "q2", "Stable problem statement.", "alice");
    const first = await indexMaterials("acme", "q2");
    const second = await indexMaterials("acme", "q2");
    expect(second.chunks).toHaveLength(first.chunks.length);
    expect(second.chunks[0]?.embedding).toEqual(first.chunks[0]!.embedding);
  });

  test("is invalidated by pipeline-version mismatch", async () => {
    if (!embeddingsAvailable) return;
    await writeProblem("acme", "q2", "Original.", "alice");
    await indexMaterials("acme", "q2");
    // Hand-corrupt the version in the index.
    const path = resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache", "materials-index.json");
    const bad = JSON.stringify({ version: 0, model: "nope", chunks: [] });
    await mkdir(resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache"), { recursive: true });
    await writeFile(path, bad);
    // Rebuild should discard and re-index.
    const rebuilt = await indexMaterials("acme", "q2");
    expect(rebuilt.chunks.length).toBeGreaterThan(0);
  });
});

describe("retrieveForRender", () => {
  test("returns top-K chunks relevant to the query ideas", async () => {
    if (!embeddingsAvailable) return;
    await writeProblem("acme", "q2", "We are shipping onboarding v2 by May 1.", "alice");
    await addMaterial(
      "acme",
      "q2",
      "legal.md",
      "The KYC regulation takes effect May 15. Non-negotiable.",
      "alice",
    );
    await addMaterial(
      "acme",
      "q2",
      "weather.md",
      "The climate in Patagonia features strong winds year-round.",
      "alice",
    );
    const chunks = await retrieveForRender(
      "acme",
      "q2",
      ["We should ship before the KYC deadline"],
      2,
    );
    expect(chunks).toHaveLength(2);
    // The legal chunk should rank higher than the weather chunk.
    expect(chunks[0]?.source).toMatch(/problem|legal/);
  });

  test("returns [] for empty input or empty index", async () => {
    if (!embeddingsAvailable) return;
    const empty = await retrieveForRender("acme", "q2", [], 3);
    expect(empty).toEqual([]);
  });
});

describe("formatProjectContextBlock", () => {
  test("emits empty string when no chunks", () => {
    expect(formatProjectContextBlock([])).toBe("");
  });

  test("wraps chunks in <project-context>", () => {
    const out = formatProjectContextBlock([
      { source: "problem.md", text: "X", score: 0.9 },
      { source: "materials/y.md", text: "Y", score: 0.6 },
    ]);
    expect(out).toContain("<project-context>");
    expect(out).toContain("</project-context>");
    expect(out).toContain("[problem.md]");
    expect(out).toContain("[materials/y.md]");
    expect(out).toContain("X");
    expect(out).toContain("Y");
  });
});
