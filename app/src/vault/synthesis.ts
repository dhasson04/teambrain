import { blake3 } from "@noble/hashes/blake3";
import { existsSync } from "node:fs";
import { readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import {
  atomicWriteFile,
  ensureDir,
  parseFrontmatter,
  resolveVaultPath,
  serializeFrontmatter,
} from "./fs-utils";
import { getSubproject } from "./subprojects";

const HISTORY_CAP = 20;

export interface SynthesisFrontmatter {
  created: string;
  dump_count: number;
  model: string;
}

function synthesisDir(p: string, s: string): string {
  return resolveVaultPath("projects", p, "subprojects", s, "synthesis");
}
function historyDir(p: string, s: string): string {
  return `${synthesisDir(p, s)}/history`;
}
function latestPath(p: string, s: string): string {
  return `${synthesisDir(p, s)}/latest.md`;
}

export interface DumpHashEntry {
  dump_id: string;
  hash: string;
}

function lastSynthInputPath(p: string, s: string): string {
  return resolveVaultPath("projects", p, "subprojects", s, ".cache", "last-synth-input.json");
}

function blake3hex(content: string): string {
  const bytes = blake3(new TextEncoder().encode(content));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function inputSha(entries: DumpHashEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.dump_id < b.dump_id ? -1 : 1));
  const repr = sorted.map((e) => `${e.dump_id}:${e.hash}`).join("\n");
  return blake3hex(repr);
}

async function pruneHistory(p: string, s: string): Promise<void> {
  const dir = historyDir(p, s);
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: { name: string; mtime: number }[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const s = await stat(`${dir}/${e.name}`);
    files.push({ name: e.name, mtime: s.mtimeMs });
  }
  if (files.length <= HISTORY_CAP) return;
  files.sort((a, b) => a.mtime - b.mtime);
  const toDelete = files.slice(0, files.length - HISTORY_CAP);
  for (const f of toDelete) {
    await unlink(`${dir}/${f.name}`);
  }
}

export async function writeSynthesis(
  p: string,
  s: string,
  body: string,
  meta: SynthesisFrontmatter,
  inputs: DumpHashEntry[],
): Promise<{ path: string; archivedAs: string | null }> {
  if (!(await getSubproject(p, s))) throw new Error("subproject not found");
  await ensureDir(synthesisDir(p, s));
  await ensureDir(historyDir(p, s));

  const out = serializeFrontmatter(meta, body);
  const target = latestPath(p, s);

  // Archive prior latest.md if any.
  let archivedAs: string | null = null;
  if (existsSync(target)) {
    const prior = await readFile(target, "utf8");
    const { data } = parseFrontmatter<{ created?: string }>(prior);
    const archiveSha = data.created ? blake3hex(prior) : blake3hex(prior);
    const archiveName = `${archiveSha}.md`;
    archivedAs = `${historyDir(p, s)}/${archiveName}`;
    await rename(target, archivedAs);
  }

  await atomicWriteFile(target, out);
  await pruneHistory(p, s);
  await saveLastSynthInput(p, s, inputs);
  return { path: target, archivedAs };
}

export async function readSynthesis(
  p: string,
  s: string,
): Promise<{ meta: SynthesisFrontmatter; body: string } | null> {
  const path = latestPath(p, s);
  if (!existsSync(path)) return null;
  const { data, body } = parseFrontmatter<SynthesisFrontmatter>(await readFile(path, "utf8"));
  return { meta: data, body };
}

export async function listHistory(p: string, s: string): Promise<string[]> {
  const dir = historyDir(p, s);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
}

export async function readLastSynthInput(p: string, s: string): Promise<DumpHashEntry[]> {
  const path = lastSynthInputPath(p, s);
  if (!existsSync(path)) return [];
  return JSON.parse(await readFile(path, "utf8")) as DumpHashEntry[];
}

export async function saveLastSynthInput(
  p: string,
  s: string,
  inputs: DumpHashEntry[],
): Promise<void> {
  await ensureDir(resolveVaultPath("projects", p, "subprojects", s, ".cache"));
  await atomicWriteFile(lastSynthInputPath(p, s), `${JSON.stringify(inputs, null, 2)}\n`);
}

export interface SynthDiff {
  added: string[];
  changed: string[];
  removed: string[];
  needsMergeRePass: boolean;
}

/**
 * Compare current dump hashes vs last synthesized snapshot.
 * Removals trigger a merge re-pass even if no dump changed,
 * because the merger's output depends on the full set.
 */
export function diffByHash(current: DumpHashEntry[], last: DumpHashEntry[]): SynthDiff {
  const lastById = new Map(last.map((e) => [e.dump_id, e.hash]));
  const currentById = new Map(current.map((e) => [e.dump_id, e.hash]));
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const e of current) {
    const prev = lastById.get(e.dump_id);
    if (prev === undefined) added.push(e.dump_id);
    else if (prev !== e.hash) changed.push(e.dump_id);
  }
  for (const e of last) {
    if (!currentById.has(e.dump_id)) removed.push(e.dump_id);
  }
  return { added, changed, removed, needsMergeRePass: removed.length > 0 };
}
