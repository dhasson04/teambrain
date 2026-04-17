import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicWriteFile,
  ensureDir,
  getVaultRoot,
  parseFrontmatter,
  resolveVaultPath,
  serializeFrontmatter,
  slugify,
} from "./fs-utils";

let tmpRoot: string;
let originalVault: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-fs-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
});

afterEach(async () => {
  if (originalVault === undefined) {
    delete process.env["TEAMBRAIN_VAULT"];
  } else {
    process.env["TEAMBRAIN_VAULT"] = originalVault;
  }
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("getVaultRoot / resolveVaultPath", () => {
  test("resolves the vault root from TEAMBRAIN_VAULT", () => {
    expect(getVaultRoot()).toBe(tmpRoot);
  });

  test("joins segments under the vault root", () => {
    expect(resolveVaultPath("projects", "acme", "_meta.json")).toBe(
      join(tmpRoot, "projects", "acme", "_meta.json"),
    );
  });
});

describe("ensureDir", () => {
  test("creates a deeply nested directory", async () => {
    const target = join(tmpRoot, "a", "b", "c");
    await ensureDir(target);
    const s = await stat(target);
    expect(s.isDirectory()).toBe(true);
  });

  test("is idempotent for an existing directory", async () => {
    const target = join(tmpRoot, "exists");
    await ensureDir(target);
    await ensureDir(target);
    const s = await stat(target);
    expect(s.isDirectory()).toBe(true);
  });
});

describe("atomicWriteFile", () => {
  test("writes content and ensures parent directory exists", async () => {
    const target = join(tmpRoot, "nested", "out.md");
    await atomicWriteFile(target, "hello world");
    const content = await readFile(target, "utf8");
    expect(content).toBe("hello world");
  });

  test("overwrites an existing file atomically", async () => {
    const target = join(tmpRoot, "file.txt");
    await atomicWriteFile(target, "v1");
    await atomicWriteFile(target, "v2");
    expect(await readFile(target, "utf8")).toBe("v2");
  });

  test("does not leave a .tmp behind on success", async () => {
    const target = join(tmpRoot, "clean.md");
    await atomicWriteFile(target, "ok");
    await expect(stat(`${target}.tmp`)).rejects.toThrow();
  });
});

describe("slugify", () => {
  test("kebab-cases plain ASCII", () => {
    expect(slugify("Acme Corp")).toBe("acme-corp");
  });

  test("strips diacritics", () => {
    expect(slugify("Café Résumé")).toBe("cafe-resume");
  });

  test("collapses runs of separators and trims dashes", () => {
    expect(slugify("  Hello -- World !! ")).toBe("hello-world");
  });

  test("returns empty string for input that has no alphanumerics", () => {
    expect(slugify("!!! @@@ ###")).toBe("");
  });
});

describe("parseFrontmatter / serializeFrontmatter", () => {
  test("parses a markdown file with frontmatter", () => {
    const md = "---\ntitle: Hello\ncount: 3\n---\nbody text\n";
    const { data, body } = parseFrontmatter<{ title: string; count: number }>(md);
    expect(data.title).toBe("Hello");
    expect(data.count).toBe(3);
    expect(body).toBe("body text\n");
  });

  test("returns empty data + full body when no frontmatter is present", () => {
    const md = "no frontmatter here";
    const { data, body } = parseFrontmatter(md);
    expect(data).toEqual({});
    expect(body).toBe("no frontmatter here");
  });

  test("handles CRLF line endings", () => {
    const md = "---\r\nkey: value\r\n---\r\nbody\r\n";
    const { data, body } = parseFrontmatter<{ key: string }>(md);
    expect(data.key).toBe("value");
    expect(body).toBe("body\r\n");
  });

  test("round-trips through serialize and parse", () => {
    const original = { author: "lucas", created: "2026-04-17" };
    const out = serializeFrontmatter(original, "the body\n");
    const { data, body } = parseFrontmatter<typeof original>(out);
    expect(data).toEqual(original);
    expect(body).toBe("the body\n");
  });

  test("serializes empty data as plain body", () => {
    expect(serializeFrontmatter({}, "just body")).toBe("just body");
  });
});
