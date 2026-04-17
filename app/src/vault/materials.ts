import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import {
  atomicWriteFile,
  ensureDir,
  parseFrontmatter,
  resolveVaultPath,
  serializeFrontmatter,
  slugify,
} from "./fs-utils";
import { getSubproject } from "./subprojects";

export interface MaterialFrontmatter {
  title: string;
  source: string;
  added_by: string;
  added_at: string;
}

export interface MaterialMeta extends MaterialFrontmatter {
  filename: string;
  bytes: number;
}

function problemPath(project: string, sub: string): string {
  return resolveVaultPath("projects", project, "subprojects", sub, "problem.md");
}

function materialsDir(project: string, sub: string): string {
  return resolveVaultPath("projects", project, "subprojects", sub, "materials");
}

export interface ProblemFrontmatter {
  updated: string;
  updated_by: string;
}

export async function readProblem(project: string, sub: string): Promise<{ data: ProblemFrontmatter; body: string } | null> {
  const path = problemPath(project, sub);
  if (!existsSync(path)) return null;
  return parseFrontmatter<ProblemFrontmatter>(await readFile(path, "utf8"));
}

export async function writeProblem(project: string, sub: string, body: string, profileId: string): Promise<void> {
  if (!(await getSubproject(project, sub))) throw new Error("subproject not found");
  const fm: ProblemFrontmatter = { updated: new Date().toISOString(), updated_by: profileId };
  await atomicWriteFile(problemPath(project, sub), serializeFrontmatter(fm, body));
}

const TXT_EXT = /\.txt$/i;
const MD_EXT = /\.md$/i;

function normalizeFilename(input: string): string {
  const base = input.replace(/\.(md|txt)$/i, "");
  const slug = slugify(base);
  if (!slug) throw new Error("filename yields empty slug");
  return `${slug}.md`;
}

async function uniqueFilename(project: string, sub: string, candidate: string): Promise<string> {
  const dir = materialsDir(project, sub);
  if (!existsSync(`${dir}/${candidate}`)) return candidate;
  const stem = candidate.replace(MD_EXT, "");
  for (let i = 2; i < 1000; i++) {
    const next = `${stem}-${i}.md`;
    if (!existsSync(`${dir}/${next}`)) return next;
  }
  throw new Error("too many filename collisions");
}

export async function addMaterial(
  project: string,
  sub: string,
  filename: string,
  content: string,
  profileId: string,
  options: { source?: string } = {},
): Promise<MaterialMeta> {
  if (!(await getSubproject(project, sub))) throw new Error("subproject not found");
  if (!MD_EXT.test(filename) && !TXT_EXT.test(filename)) {
    throw new Error("only .md and .txt accepted");
  }
  const dir = materialsDir(project, sub);
  await ensureDir(dir);
  const normalized = normalizeFilename(filename);
  const finalName = await uniqueFilename(project, sub, normalized);
  const title = filename.replace(/\.(md|txt)$/i, "");
  const fm: MaterialFrontmatter = {
    title,
    source: options.source ?? "manual",
    added_by: profileId,
    added_at: new Date().toISOString(),
  };
  const out = serializeFrontmatter(fm, content);
  const fullPath = `${dir}/${finalName}`;
  await atomicWriteFile(fullPath, out);
  return { ...fm, filename: finalName, bytes: out.length };
}

export async function listMaterials(project: string, sub: string): Promise<MaterialMeta[]> {
  const dir = materialsDir(project, sub);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: MaterialMeta[] = [];
  for (const e of entries) {
    if (!e.isFile() || !MD_EXT.test(e.name)) continue;
    const content = await readFile(`${dir}/${e.name}`, "utf8");
    const { data } = parseFrontmatter<MaterialFrontmatter>(content);
    out.push({
      filename: e.name,
      bytes: content.length,
      title: data.title ?? e.name,
      source: data.source ?? "unknown",
      added_by: data.added_by ?? "unknown",
      added_at: data.added_at ?? "",
    });
  }
  return out.sort((a, b) => (a.added_at < b.added_at ? -1 : 1));
}

export async function getMaterial(project: string, sub: string, filename: string): Promise<{ meta: MaterialMeta; body: string } | null> {
  const dir = materialsDir(project, sub);
  const path = `${dir}/${filename}`;
  if (!existsSync(path)) return null;
  const content = await readFile(path, "utf8");
  const { data, body } = parseFrontmatter<MaterialFrontmatter>(content);
  return {
    meta: {
      filename,
      bytes: content.length,
      title: data.title ?? filename,
      source: data.source ?? "unknown",
      added_by: data.added_by ?? "unknown",
      added_at: data.added_at ?? "",
    },
    body,
  };
}
