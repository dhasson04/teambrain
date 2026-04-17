import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { atomicWriteFile, ensureDir, resolveVaultPath, slugify } from "./fs-utils";
import { getProject } from "./projects";

export interface SubprojectMeta {
  slug: string;
  display_name: string;
  created: string;
  archived: boolean;
}

export class ParentMissingError extends Error {
  constructor(public readonly projectSlug: string) {
    super(`parent project not found: ${projectSlug}`);
    this.name = "ParentMissingError";
  }
}

export class SubSlugCollisionError extends Error {
  constructor(public readonly slug: string) {
    super(`subproject slug already exists: ${slug}`);
    this.name = "SubSlugCollisionError";
  }
}

const SUBDIRS = ["materials", "dumps", "ideas", "synthesis", "synthesis/history", ".cache"];

function subRoot(project: string): string {
  return resolveVaultPath("projects", project, "subprojects");
}

function subDir(project: string, sub: string): string {
  return resolveVaultPath("projects", project, "subprojects", sub);
}

function subMetaPath(project: string, sub: string): string {
  return resolveVaultPath("projects", project, "subprojects", sub, "_meta.json");
}

export async function listSubprojects(project: string, includeArchived = false): Promise<SubprojectMeta[]> {
  const root = subRoot(project);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: SubprojectMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const path = subMetaPath(project, e.name);
    if (!existsSync(path)) continue;
    const meta = JSON.parse(await readFile(path, "utf8")) as SubprojectMeta;
    if (!includeArchived && meta.archived) continue;
    out.push(meta);
  }
  return out.sort((a, b) => (a.created < b.created ? -1 : 1));
}

export async function getSubproject(project: string, sub: string): Promise<SubprojectMeta | null> {
  const path = subMetaPath(project, sub);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as SubprojectMeta;
}

export async function createSubproject(project: string, displayName: string): Promise<SubprojectMeta> {
  if (!(await getProject(project))) throw new ParentMissingError(project);
  const slug = slugify(displayName);
  if (!slug) throw new Error("display_name yields empty slug");
  if (await getSubproject(project, slug)) throw new SubSlugCollisionError(slug);
  const meta: SubprojectMeta = {
    slug,
    display_name: displayName,
    created: new Date().toISOString(),
    archived: false,
  };
  const base = subDir(project, slug);
  await ensureDir(base);
  for (const d of SUBDIRS) await ensureDir(`${base}/${d}`);
  await atomicWriteFile(subMetaPath(project, slug), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

export async function renameSubproject(project: string, sub: string, displayName: string): Promise<SubprojectMeta | null> {
  const meta = await getSubproject(project, sub);
  if (!meta) return null;
  meta.display_name = displayName;
  await atomicWriteFile(subMetaPath(project, sub), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

export async function archiveSubproject(project: string, sub: string): Promise<SubprojectMeta | null> {
  const meta = await getSubproject(project, sub);
  if (!meta) return null;
  meta.archived = true;
  await atomicWriteFile(subMetaPath(project, sub), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}
