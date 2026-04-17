import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { atomicWriteFile, ensureDir, resolveVaultPath, slugify } from "./fs-utils";

export interface ProjectMeta {
  slug: string;
  display_name: string;
  created: string;
  archived: boolean;
}

function projectsRoot(): string {
  return resolveVaultPath("projects");
}

function projectMetaPath(slug: string): string {
  return resolveVaultPath("projects", slug, "_meta.json");
}

export async function listProjects(includeArchived = false): Promise<ProjectMeta[]> {
  const root = projectsRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: ProjectMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const path = projectMetaPath(e.name);
    if (!existsSync(path)) continue;
    const meta = JSON.parse(await readFile(path, "utf8")) as ProjectMeta;
    if (!includeArchived && meta.archived) continue;
    out.push(meta);
  }
  return out.sort((a, b) => (a.created < b.created ? -1 : 1));
}

export async function getProject(slug: string): Promise<ProjectMeta | null> {
  const path = projectMetaPath(slug);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ProjectMeta;
}

export class SlugCollisionError extends Error {
  constructor(public readonly slug: string) {
    super(`project slug already exists: ${slug}`);
    this.name = "SlugCollisionError";
  }
}

export async function createProject(displayName: string): Promise<ProjectMeta> {
  const slug = slugify(displayName);
  if (!slug) throw new Error("display_name yields empty slug");
  if (await getProject(slug)) throw new SlugCollisionError(slug);
  const meta: ProjectMeta = {
    slug,
    display_name: displayName,
    created: new Date().toISOString(),
    archived: false,
  };
  await ensureDir(resolveVaultPath("projects", slug));
  await atomicWriteFile(projectMetaPath(slug), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

export async function renameProject(slug: string, displayName: string): Promise<ProjectMeta | null> {
  const meta = await getProject(slug);
  if (!meta) return null;
  meta.display_name = displayName;
  await atomicWriteFile(projectMetaPath(slug), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

export async function archiveProject(slug: string): Promise<ProjectMeta | null> {
  const meta = await getProject(slug);
  if (!meta) return null;
  meta.archived = true;
  await atomicWriteFile(projectMetaPath(slug), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}
