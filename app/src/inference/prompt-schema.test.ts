import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseFrontmatter } from "../vault/fs-utils";
import {
  ExplorationFrontmatterSchema,
  PromptFrontmatterSchema,
  SynthesisFrontmatterSchema,
} from "./prompt-schema";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

async function readPromptFrontmatter(rel: string): Promise<unknown> {
  const path = resolve(REPO_ROOT, rel);
  const content = await readFile(path, "utf8");
  const { data } = parseFrontmatter(content);
  return data;
}

describe("PromptFrontmatterSchema", () => {
  test("rejects unknown keys (strict)", () => {
    const result = PromptFrontmatterSchema.safeParse({
      id: "x",
      version: "0.1.0",
      model: "m",
      temperature: 0.5,
      top_p: 0.8,
      top_k: 40,
      description: "d",
      includes: [],
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-semver version", () => {
    const result = PromptFrontmatterSchema.safeParse({
      id: "x",
      version: "1.0",
      model: "m",
      temperature: 0.5,
      top_p: 0.8,
      top_k: 40,
      description: "d",
    });
    expect(result.success).toBe(false);
  });
});

describe("shipped prompt files", () => {
  test("prompts/synthesis.md frontmatter validates against SynthesisFrontmatterSchema", async () => {
    const fm = await readPromptFrontmatter("prompts/synthesis.md");
    const result = SynthesisFrontmatterSchema.safeParse(fm);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temperature).toBeLessThanOrEqual(0.5);
      expect(result.data.includes).toContain("_shared/house_style.md");
      expect(result.data.includes).toContain("_shared/safety.md");
    }
  });

  test("prompts/exploration.md frontmatter validates against ExplorationFrontmatterSchema", async () => {
    const fm = await readPromptFrontmatter("prompts/exploration.md");
    const result = ExplorationFrontmatterSchema.safeParse(fm);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temperature).toBeGreaterThanOrEqual(0.9);
    }
  });

  test("_shared/house_style.md and safety.md exist", () => {
    expect(existsSync(resolve(REPO_ROOT, "prompts/_shared/house_style.md"))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, "prompts/_shared/safety.md"))).toBe(true);
  });

  test("synthesis prompt body mentions verbatim citation", async () => {
    const path = resolve(REPO_ROOT, "prompts/synthesis.md");
    const content = await readFile(path, "utf8");
    expect(content.toLowerCase()).toContain("verbatim");
    expect(content).toMatch(/\[Author, dump-id\]/);
  });

  test("exploration prompt body forbids inventing source data", async () => {
    const path = resolve(REPO_ROOT, "prompts/exploration.md");
    const content = await readFile(path, "utf8");
    expect(content.toLowerCase()).toContain("never fabricate");
  });
});
