import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Default vault location relative to the current working directory.
 * Override via TEAMBRAIN_VAULT env var.
 */
const DEFAULT_VAULT = "./vault";

export function getVaultRoot(): string {
  return resolve(process.env["TEAMBRAIN_VAULT"] ?? DEFAULT_VAULT);
}

export function resolveVaultPath(...segments: string[]): string {
  return join(getVaultRoot(), ...segments);
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Atomic write: writes to <path>.tmp then renames to <path>.
 * Guarantees readers never see a partial file even on crash.
 */
export async function atomicWriteFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}

/**
 * Kebab-case slug: lowercases, strips diacritics, collapses non-alphanumerics
 * to single dashes, trims leading/trailing dashes.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedFrontmatter<T> {
  data: T;
  body: string;
}

/**
 * Parses YAML frontmatter from a markdown file.
 * Returns { data: {} as T, body: content } if no frontmatter is present.
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string,
): ParsedFrontmatter<T> {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { data: {} as T, body: content };
  }
  const yamlBlock = match[1] ?? "";
  const body = match[2] ?? "";
  const data = (parseYaml(yamlBlock) ?? {}) as T;
  return { data, body };
}

/**
 * Serializes data + body back into a markdown string with frontmatter.
 * Empty data -> just the body (no frontmatter wrapper).
 */
export function serializeFrontmatter<T>(data: T, body: string): string {
  if (!data || (typeof data === "object" && Object.keys(data as object).length === 0)) {
    return body;
  }
  const yaml = stringifyYaml(data, { lineWidth: 0 }).trim();
  const trailingNewline = body.endsWith("\n") || body.length === 0 ? "" : "\n";
  return `---\n${yaml}\n---\n${body}${trailingNewline}`;
}
