import { blake3 } from "@noble/hashes/blake3";
import { existsSync } from "node:fs";
import { readFile, readdir, unlink } from "node:fs/promises";
import {
  atomicWriteFile,
  ensureDir,
  parseFrontmatter,
  resolveVaultPath,
  serializeFrontmatter,
} from "./fs-utils";
import { getSubproject } from "./subprojects";

export interface DumpFrontmatter {
  author: string;
  created: string;
  updated: string;
}

export interface DumpMeta extends DumpFrontmatter {
  id: string;
  bytes: number;
  hash: string;
}

export interface DumpFull extends DumpMeta {
  body: string;
}

function dumpsDir(project: string, sub: string): string {
  return resolveVaultPath("projects", project, "subprojects", sub, "dumps");
}

function dumpPath(project: string, sub: string, id: string): string {
  return `${dumpsDir(project, sub)}/${id}.md`;
}

function chunkHashesPath(project: string, sub: string): string {
  return resolveVaultPath("projects", project, "subprojects", sub, ".cache", "chunk-hashes.json");
}

function blake3hex(content: string): string {
  const bytes = blake3(new TextEncoder().encode(content));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadChunkHashes(project: string, sub: string): Promise<Record<string, string>> {
  const path = chunkHashesPath(project, sub);
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
}

async function saveChunkHashes(project: string, sub: string, hashes: Record<string, string>): Promise<void> {
  await atomicWriteFile(chunkHashesPath(project, sub), `${JSON.stringify(hashes, null, 2)}\n`);
}

function deriveDumpId(author: string, when: Date): string {
  const iso = when.toISOString().replace(/[:.]/g, "-").replace("Z", "z");
  return `${author}-${iso}`;
}

export class DumpForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DumpForbiddenError";
  }
}

export async function createDump(project: string, sub: string, author: string, body: string): Promise<DumpMeta> {
  if (!(await getSubproject(project, sub))) throw new Error("subproject not found");
  const now = new Date();
  const id = deriveDumpId(author, now);
  const fm: DumpFrontmatter = { author, created: now.toISOString(), updated: now.toISOString() };
  await ensureDir(dumpsDir(project, sub));
  const out = serializeFrontmatter(fm, body);
  await atomicWriteFile(dumpPath(project, sub, id), out);
  const hash = blake3hex(body.trim());
  const hashes = await loadChunkHashes(project, sub);
  hashes[id] = hash;
  await saveChunkHashes(project, sub, hashes);
  return { id, bytes: out.length, hash, ...fm };
}

async function readDumpFile(path: string): Promise<{ data: DumpFrontmatter; body: string; bytes: number } | null> {
  if (!existsSync(path)) return null;
  const content = await readFile(path, "utf8");
  const { data, body } = parseFrontmatter<DumpFrontmatter>(content);
  return { data, body, bytes: content.length };
}

export async function getDump(project: string, sub: string, id: string): Promise<DumpFull | null> {
  const out = await readDumpFile(dumpPath(project, sub, id));
  if (!out) return null;
  return {
    id,
    bytes: out.bytes,
    hash: blake3hex(out.body),
    body: out.body,
    author: out.data.author,
    created: out.data.created,
    updated: out.data.updated,
  };
}

export async function updateDump(project: string, sub: string, id: string, body: string, author: string): Promise<DumpMeta | null> {
  const path = dumpPath(project, sub, id);
  const existing = await readDumpFile(path);
  if (!existing) return null;
  if (existing.data.author !== author) {
    throw new DumpForbiddenError("cannot edit another author's dump");
  }
  const fm: DumpFrontmatter = { ...existing.data, updated: new Date().toISOString() };
  const out = serializeFrontmatter(fm, body);
  await atomicWriteFile(path, out);
  const hash = blake3hex(body.trim());
  const hashes = await loadChunkHashes(project, sub);
  hashes[id] = hash;
  await saveChunkHashes(project, sub, hashes);
  return { id, bytes: out.length, hash, ...fm };
}

export async function deleteDump(project: string, sub: string, id: string, author: string): Promise<boolean> {
  const path = dumpPath(project, sub, id);
  const existing = await readDumpFile(path);
  if (!existing) return false;
  if (existing.data.author !== author) {
    throw new DumpForbiddenError("cannot delete another author's dump");
  }
  await unlink(path);
  const hashes = await loadChunkHashes(project, sub);
  delete hashes[id];
  await saveChunkHashes(project, sub, hashes);
  return true;
}

export async function listDumps(
  project: string,
  sub: string,
  options: { author?: string; includeBody?: boolean } = {},
): Promise<(DumpMeta | DumpFull)[]> {
  const dir = dumpsDir(project, sub);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: (DumpMeta | DumpFull)[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const id = e.name.replace(/\.md$/, "");
    const file = await readDumpFile(`${dir}/${e.name}`);
    if (!file) continue;
    if (options.author && file.data.author !== options.author) continue;
    const hash = blake3hex(file.body.trim());
    const meta: DumpMeta = {
      id,
      bytes: file.bytes,
      hash,
      author: file.data.author,
      created: file.data.created,
      updated: file.data.updated,
    };
    if (options.includeBody) {
      out.push({ ...meta, body: file.body });
    } else {
      out.push(meta);
    }
  }
  return out.sort((a, b) => (a.created < b.created ? -1 : 1));
}
