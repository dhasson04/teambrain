// R005: contextual retrieval over materials + problem.md.
//
// The 2026-04-17 smoke test's "Big Lie": the README promises problem.md
// and materials feed the synthesis, but grep of app/src/inference/ showed
// ZERO references. The kickoff meeting transcript pasted during that run
// had no effect on output. This module closes that gap at render time.
//
// Design (per research/pipeline-quality-improvement.md §3.E):
//   1. Chunk problem.md + each materials/*.md into ~300-token pieces
//      (one chunk per file for v1 unless > 600 tokens).
//   2. Embed every chunk via MiniLM (R002) on index build.
//   3. Persist to .cache/materials-index.json with { version, model, chunks }.
//   4. Mtime-based invalidation: rebuild only what changed.
//   5. At render time: embed a query derived from concatenated idea
//      statements, cosine-search the index, return top-3 chunks.
//   6. Renderer prepends <project-context> block with retrieved content.
//
// Deliberately NOT touching extract or merge — per-dump attribution stays
// clean. Materials influence the RENDER prompt only.

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { atomicWriteFile, ensureDir, resolveVaultPath } from "../vault/fs-utils";
import { listMaterials, readProblem } from "../vault/materials";
import { PIPELINE_VERSION } from "../vault/synthesis";
import { cosineSimilarity, embed, EMBEDDING_MODEL_ID } from "./embeddings";

export interface RetrievedChunk {
  source: string; // "problem.md" or "materials/<filename>"
  text: string;
  score: number;
}

interface IndexedChunk {
  source: string;
  mtime_ms: number;
  text: string;
  embedding: number[];
}

interface MaterialsIndex {
  version: number;
  model: string;
  chunks: IndexedChunk[];
}

function indexPath(project: string, sub: string): string {
  return resolveVaultPath("projects", project, "subprojects", sub, ".cache", "materials-index.json");
}

function chunkBody(body: string, maxChars = 1200): string[] {
  // Simple paragraph-based chunker. 1 chunk per paragraph cluster up to
  // maxChars. Respects paragraph boundaries (double newline).
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current.length === 0) {
      current = p;
    } else if (current.length + p.length + 2 <= maxChars) {
      current = `${current}\n\n${p}`;
    } else {
      chunks.push(current);
      current = p;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [body.trim()];
}

async function readIndex(project: string, sub: string): Promise<MaterialsIndex | null> {
  const path = indexPath(project, sub);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as MaterialsIndex;
    if (raw.version !== PIPELINE_VERSION || raw.model !== EMBEDDING_MODEL_ID) {
      return null; // stale — force rebuild
    }
    return raw;
  } catch {
    return null;
  }
}

async function writeIndex(project: string, sub: string, index: MaterialsIndex): Promise<void> {
  await ensureDir(resolveVaultPath("projects", project, "subprojects", sub, ".cache"));
  await atomicWriteFile(indexPath(project, sub), `${JSON.stringify(index, null, 2)}\n`);
}

function safeStatMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Build or update the materials index. Reads problem.md and all
 * materials/*.md, chunks them, embeds changed chunks, persists.
 * Idempotent — run at the start of each synthesize.
 */
export async function indexMaterials(project: string, sub: string): Promise<MaterialsIndex> {
  const existing = (await readIndex(project, sub)) ?? {
    version: PIPELINE_VERSION,
    model: EMBEDDING_MODEL_ID,
    chunks: [],
  };

  const existingBySource = new Map<string, IndexedChunk[]>();
  for (const c of existing.chunks) {
    const arr = existingBySource.get(c.source) ?? [];
    arr.push(c);
    existingBySource.set(c.source, arr);
  }

  const fresh: IndexedChunk[] = [];
  const pendingEmbed: Array<{ source: string; mtime_ms: number; text: string }> = [];

  // Problem.md as one source.
  const problemP = resolveVaultPath("projects", project, "subprojects", sub, "problem.md");
  const problem = await readProblem(project, sub);
  if (problem && problem.body.trim().length > 0) {
    const mtime = safeStatMs(problemP);
    const priors = existingBySource.get("problem.md");
    const bodyChunks = chunkBody(problem.body);
    for (const [idx, text] of bodyChunks.entries()) {
      const sourceKey = bodyChunks.length === 1 ? "problem.md" : `problem.md#${idx}`;
      const prior = priors?.find((p) => p.source === sourceKey && p.text === text && p.mtime_ms === mtime);
      if (prior) fresh.push(prior);
      else pendingEmbed.push({ source: sourceKey, mtime_ms: mtime, text });
    }
  }

  // Each materials/*.md.
  const mats = await listMaterials(project, sub);
  for (const m of mats) {
    const fullPath = resolveVaultPath(
      "projects",
      project,
      "subprojects",
      sub,
      "materials",
      m.filename,
    );
    const mtime = safeStatMs(fullPath);
    const sourcePrefix = `materials/${m.filename}`;
    const priors = existingBySource.get(sourcePrefix);
    let body = "";
    try {
      const raw = await readFile(fullPath, "utf8");
      // Strip frontmatter if present.
      body = raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
    } catch {
      continue;
    }
    if (body.length === 0) continue;
    const bodyChunks = chunkBody(body);
    for (const [idx, text] of bodyChunks.entries()) {
      const sourceKey = bodyChunks.length === 1 ? sourcePrefix : `${sourcePrefix}#${idx}`;
      const prior = priors?.find(
        (p) => p.source === sourceKey && p.text === text && p.mtime_ms === mtime,
      );
      if (prior) fresh.push(prior);
      else pendingEmbed.push({ source: sourceKey, mtime_ms: mtime, text });
    }
  }

  if (pendingEmbed.length > 0) {
    const embeddings = await embed(pendingEmbed.map((p) => p.text));
    for (const [i, p] of pendingEmbed.entries()) {
      fresh.push({ source: p.source, mtime_ms: p.mtime_ms, text: p.text, embedding: embeddings[i]! });
    }
  }

  const next: MaterialsIndex = {
    version: PIPELINE_VERSION,
    model: EMBEDDING_MODEL_ID,
    chunks: fresh,
  };
  await writeIndex(project, sub, next);
  return next;
}

/**
 * Retrieve the top-K chunks most relevant to the current synthesis ideas.
 * The query embedding is built from concatenated idea statements.
 */
export async function retrieveForRender(
  project: string,
  sub: string,
  ideaStatements: string[],
  topK = 3,
): Promise<RetrievedChunk[]> {
  if (ideaStatements.length === 0) return [];
  const index = await indexMaterials(project, sub);
  if (index.chunks.length === 0) return [];
  const query = ideaStatements.join(" \n ");
  const [queryEmbedding] = await embed([query]);
  if (!queryEmbedding) return [];
  const scored = index.chunks.map((c) => ({
    source: c.source,
    text: c.text,
    score: cosineSimilarity(queryEmbedding, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Format retrieved chunks as a <project-context> block for prompt injection. */
export function formatProjectContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const lines: string[] = ["<project-context>"];
  for (const c of chunks) {
    lines.push(`[${c.source}]`);
    lines.push(c.text);
    lines.push("");
  }
  lines.push("</project-context>");
  return lines.join("\n");
}
