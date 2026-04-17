import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PromptRegistry } from "./prompt-registry";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

const VALID_SYNTH = `---
id: synthesis
version: 0.1.0
model: gemma3:4b
temperature: 0.4
top_p: 0.8
top_k: 40
description: test
includes:
  - _shared/h.md
---
SYNTHESIS BODY
`;

const VALID_EXPL = `---
id: exploration
version: 0.1.0
model: gemma3:4b
temperature: 1.0
top_p: 0.95
top_k: 64
description: test
includes:
  - _shared/h.md
---
EXPLORATION BODY
`;

let dir: string;

async function seedDir(synth: string = VALID_SYNTH, expl: string = VALID_EXPL, shared = "SHARED HOUSE STYLE") {
  await mkdir(`${dir}/_shared`, { recursive: true });
  await writeFile(`${dir}/synthesis.md`, synth);
  await writeFile(`${dir}/exploration.md`, expl);
  await writeFile(`${dir}/_shared/h.md`, shared);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "teambrain-registry-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("PromptRegistry (in-memory)", () => {
  test("loads both prompts and concatenates _shared includes ahead of body", async () => {
    await seedDir();
    const reg = new PromptRegistry({ promptsDir: dir });
    await reg.load();
    const synth = reg.get("synthesis");
    expect(synth.frontmatter.id).toBe("synthesis");
    expect(synth.composed).toContain("SHARED HOUSE STYLE");
    expect(synth.composed).toContain("SYNTHESIS BODY");
    expect(synth.composed.indexOf("SHARED")).toBeLessThan(synth.composed.indexOf("SYNTHESIS BODY"));
  });

  test("get on unknown id throws", async () => {
    await seedDir();
    const reg = new PromptRegistry({ promptsDir: dir });
    await reg.load();
    expect(() => reg.get("missing")).toThrow();
  });

  test("invalid frontmatter keeps last-good cached version on reload", async () => {
    await seedDir();
    const reg = new PromptRegistry({ promptsDir: dir });
    await reg.load();
    const before = reg.get("synthesis");

    // Break the file with a non-numeric temperature
    const broken = VALID_SYNTH.replace("temperature: 0.4", "temperature: not-a-number");
    await writeFile(`${dir}/synthesis.md`, broken);
    await reg.reload();

    const after = reg.get("synthesis");
    expect(after.frontmatter.temperature).toBe(before.frontmatter.temperature);
  });

  test("schema enforces synthesis temperature band", async () => {
    const tooHot = VALID_SYNTH.replace("temperature: 0.4", "temperature: 1.5");
    await seedDir(tooHot);
    const reg = new PromptRegistry({ promptsDir: dir });
    await reg.load();
    expect(() => reg.get("synthesis")).toThrow();
  });

  test("missing _shared include produces a load error", async () => {
    const noInclude = VALID_SYNTH.replace("- _shared/h.md", "- _shared/missing.md");
    await mkdir(`${dir}/_shared`, { recursive: true });
    await writeFile(`${dir}/synthesis.md`, noInclude);
    await writeFile(`${dir}/exploration.md`, VALID_EXPL);
    await writeFile(`${dir}/_shared/h.md`, "h");
    const reg = new PromptRegistry({ promptsDir: dir });
    await reg.load();
    expect(() => reg.get("synthesis")).toThrow(); // never cached
  });
});

describe("PromptRegistry against real shipped prompts", () => {
  test("loads the actual repo prompts/", async () => {
    const reg = new PromptRegistry({ promptsDir: resolve(REPO_ROOT, "prompts") });
    await reg.load();
    expect(reg.list().sort()).toEqual(["exploration", "synthesis"]);
    expect(reg.get("synthesis").composed).toContain("citation");
    expect(reg.get("exploration").composed).toContain("never");
  });
});
