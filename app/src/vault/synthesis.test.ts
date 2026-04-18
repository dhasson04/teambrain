import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVaultPath } from "./fs-utils";
import { initVault } from "./init";
import { createProject } from "./projects";
import { createSubproject } from "./subprojects";
import {
  type DumpHashEntry,
  PIPELINE_VERSION,
  diffByHash,
  inputSha,
  listHistory,
  readLastSynthInput,
  readSynthesis,
  saveLastSynthInput,
  writeSynthesis,
} from "./synthesis";
import { writeFile as writeFileNative, mkdir } from "node:fs/promises";

let tmpRoot: string;
let originalVault: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-synth-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
  await createProject("Acme");
  await createSubproject("acme", "Q2");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

const META = (count = 2) => ({ created: new Date().toISOString(), dump_count: count, model: "gemma3:4b" });
const HASHES: DumpHashEntry[] = [
  { dump_id: "alice-1", hash: "h1" },
  { dump_id: "bob-1", hash: "h2" },
];

describe("synthesis storage", () => {
  test("writeSynthesis creates latest.md, no archive on first write", async () => {
    const res = await writeSynthesis("acme", "q2", "# hello", META(), HASHES);
    expect(res.archivedAs).toBeNull();
    const out = await readSynthesis("acme", "q2");
    expect(out?.body).toContain("# hello");
    expect(out?.meta.model).toBe("gemma3:4b");
  });

  test("second write archives the prior latest into history/", async () => {
    await writeSynthesis("acme", "q2", "v1", META(), HASHES);
    const res2 = await writeSynthesis("acme", "q2", "v2", META(), HASHES);
    expect(res2.archivedAs).not.toBeNull();
    const hist = await listHistory("acme", "q2");
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatch(/^[0-9a-f]{64}\.md$/);
  });

  test("history is pruned to 20 entries", async () => {
    // Pre-seed 21 history files directly so we don't need 21 LLM-shaped writes
    const dir = resolveVaultPath("projects", "acme", "subprojects", "q2", "synthesis", "history");
    await Bun.write(`${dir}/seed.md`, "x");
    for (let i = 0; i < 21; i++) {
      const fakeSha = i.toString(16).padStart(64, "0");
      await writeFile(`${dir}/${fakeSha}.md`, `body ${i}`);
    }
    // Write a new latest -> triggers archive of prior + prune
    await writeSynthesis("acme", "q2", "first", META(), HASHES);
    await writeSynthesis("acme", "q2", "second", META(), HASHES);
    const hist = await listHistory("acme", "q2");
    expect(hist.length).toBeLessThanOrEqual(20);
  });

  test("saveLastSynthInput / readLastSynthInput round-trip", async () => {
    await writeSynthesis("acme", "q2", "x", META(), HASHES);
    const back = await readLastSynthInput("acme", "q2");
    expect(back).toEqual(HASHES);
  });
});

describe("inputSha", () => {
  test("is stable regardless of input order", () => {
    const a: DumpHashEntry[] = [
      { dump_id: "z", hash: "h" },
      { dump_id: "a", hash: "g" },
    ];
    const b: DumpHashEntry[] = [
      { dump_id: "a", hash: "g" },
      { dump_id: "z", hash: "h" },
    ];
    expect(inputSha(a)).toBe(inputSha(b));
  });

  test("changes when any hash changes", () => {
    const a: DumpHashEntry[] = [{ dump_id: "x", hash: "1" }];
    const b: DumpHashEntry[] = [{ dump_id: "x", hash: "2" }];
    expect(inputSha(a)).not.toBe(inputSha(b));
  });
});

describe("diffByHash", () => {
  test("detects added, changed, and removed dumps", () => {
    const last: DumpHashEntry[] = [
      { dump_id: "a", hash: "1" },
      { dump_id: "b", hash: "2" },
    ];
    const current: DumpHashEntry[] = [
      { dump_id: "a", hash: "1" },
      { dump_id: "b", hash: "9" },
      { dump_id: "c", hash: "3" },
    ];
    const d = diffByHash(current, last);
    expect(d.added).toEqual(["c"]);
    expect(d.changed).toEqual(["b"]);
    expect(d.removed).toEqual([]);
    expect(d.needsMergeRePass).toBe(false);
  });

  test("a removed dump triggers needsMergeRePass", () => {
    const last: DumpHashEntry[] = [{ dump_id: "a", hash: "1" }];
    const current: DumpHashEntry[] = [];
    const d = diffByHash(current, last);
    expect(d.removed).toEqual(["a"]);
    expect(d.needsMergeRePass).toBe(true);
  });
});

// T001 / R007 — PIPELINE_VERSION must invalidate stale caches cleanly.
describe("last-synth-input version gating (R007)", () => {
  test("saves with current version and reads back the hashes", async () => {
    const hashes: DumpHashEntry[] = [{ dump_id: "a", hash: "aaa" }];
    await saveLastSynthInput("acme", "q2", hashes);
    const round = await readLastSynthInput("acme", "q2");
    expect(round).toEqual(hashes);
  });

  test("legacy raw-array on-disk shape is treated as stale (returns [])", async () => {
    const path = resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache", "last-synth-input.json");
    await mkdir(resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache"), { recursive: true });
    await writeFileNative(path, JSON.stringify([{ dump_id: "a", hash: "x" }]));
    const out = await readLastSynthInput("acme", "q2");
    expect(out).toEqual([]);
  });

  test("version mismatch on disk is treated as stale (returns [])", async () => {
    const path = resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache", "last-synth-input.json");
    await mkdir(resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache"), { recursive: true });
    await writeFileNative(
      path,
      JSON.stringify({ version: PIPELINE_VERSION - 1, hashes: [{ dump_id: "a", hash: "x" }] }),
    );
    const out = await readLastSynthInput("acme", "q2");
    expect(out).toEqual([]);
  });

  test("matching version reads hashes", async () => {
    const path = resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache", "last-synth-input.json");
    await mkdir(resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache"), { recursive: true });
    await writeFileNative(
      path,
      JSON.stringify({ version: PIPELINE_VERSION, hashes: [{ dump_id: "a", hash: "x" }] }),
    );
    const out = await readLastSynthInput("acme", "q2");
    expect(out).toEqual([{ dump_id: "a", hash: "x" }]);
  });
});
