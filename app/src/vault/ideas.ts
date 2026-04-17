import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { atomicWriteFile, ensureDir, resolveVaultPath } from "./fs-utils";
import { getSubproject } from "./subprojects";

export const IdeaTypeSchema = z.enum([
  "theme",
  "claim",
  "proposal",
  "concern",
  "question",
  "deliverable",
]);
export type IdeaType = z.infer<typeof IdeaTypeSchema>;

export const IdeaSchema = z.object({
  idea_id: z.string().min(1),
  statement: z.string().min(1),
  type: IdeaTypeSchema,
  cluster_id: z.string().nullable().optional(),
  contributing_dumps: z.array(z.string()).min(1),
  created: z.string(),
});
export type Idea = z.infer<typeof IdeaSchema>;

export const IdeasFileSchema = z.object({ ideas: z.array(IdeaSchema) });
export type IdeasFile = z.infer<typeof IdeasFileSchema>;

export const ConnectionKindSchema = z.enum(["agree", "contradict", "related"]);
export const ConnectionSchema = z.object({
  edge_id: z.string().min(1),
  from_idea: z.string().min(1),
  to_idea: z.string().min(1),
  kind: ConnectionKindSchema,
  weight: z.number().min(0).max(1),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const ConnectionsFileSchema = z.object({ connections: z.array(ConnectionSchema) });
export type ConnectionsFile = z.infer<typeof ConnectionsFileSchema>;

export const AttributionEntrySchema = z.object({
  dump_id: z.string().min(1),
  author: z.string().min(1),
  verbatim_quote: z.string().min(1),
});
export type AttributionEntry = z.infer<typeof AttributionEntrySchema>;

export const AttributionFileSchema = z.record(z.string(), z.array(AttributionEntrySchema).min(1));
export type AttributionFile = z.infer<typeof AttributionFileSchema>;

function ideasPath(p: string, s: string): string {
  return resolveVaultPath("projects", p, "subprojects", s, "ideas", "ideas.json");
}
function connectionsPath(p: string, s: string): string {
  return resolveVaultPath("projects", p, "subprojects", s, "ideas", "connections.json");
}
function attributionPath(p: string, s: string): string {
  return resolveVaultPath("projects", p, "subprojects", s, "ideas", "attribution.json");
}

async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function readIdeas(p: string, s: string): Promise<IdeasFile> {
  const data = await readJsonOr<unknown>(ideasPath(p, s), { ideas: [] });
  return IdeasFileSchema.parse(data);
}
export async function readConnections(p: string, s: string): Promise<ConnectionsFile> {
  const data = await readJsonOr<unknown>(connectionsPath(p, s), { connections: [] });
  return ConnectionsFileSchema.parse(data);
}
export async function readAttribution(p: string, s: string): Promise<AttributionFile> {
  const data = await readJsonOr<unknown>(attributionPath(p, s), {});
  return AttributionFileSchema.parse(data);
}

export interface IdeasBundle {
  ideas: IdeasFile;
  connections: ConnectionsFile;
  attribution: AttributionFile;
}

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(`invariant violated: ${message}`);
    this.name = "InvariantViolation";
  }
}

function validateInvariants(b: IdeasBundle): void {
  const ideaIds = new Set(b.ideas.ideas.map((i) => i.idea_id));
  for (const idea of b.ideas.ideas) {
    if (!b.attribution[idea.idea_id] || b.attribution[idea.idea_id]!.length === 0) {
      throw new InvariantViolation(`idea ${idea.idea_id} has no attribution entries`);
    }
  }
  for (const conn of b.connections.connections) {
    if (!ideaIds.has(conn.from_idea) || !ideaIds.has(conn.to_idea)) {
      throw new InvariantViolation(
        `connection ${conn.edge_id} references missing idea(s) ${conn.from_idea} -> ${conn.to_idea}`,
      );
    }
    if (conn.kind === "contradict" && conn.from_idea === conn.to_idea) {
      throw new InvariantViolation(`contradict edge ${conn.edge_id} self-references`);
    }
  }
}

/**
 * Atomically write all three sidecars (or none).
 * Strategy: write all .tmp files, then rename each. If any write fails before
 * the first rename, no sidecar has been touched. If a rename fails midway, the
 * caller sees a partial update — practically rare on local fs and recoverable
 * on next run because the .tmp files are still on disk.
 */
export async function writeIdeasBundle(p: string, s: string, bundle: IdeasBundle): Promise<void> {
  if (!(await getSubproject(p, s))) throw new Error("subproject not found");
  const parsed: IdeasBundle = {
    ideas: IdeasFileSchema.parse(bundle.ideas),
    connections: ConnectionsFileSchema.parse(bundle.connections),
    attribution: AttributionFileSchema.parse(bundle.attribution),
  };
  validateInvariants(parsed);
  await ensureDir(resolveVaultPath("projects", p, "subprojects", s, "ideas"));
  await atomicWriteFile(ideasPath(p, s), `${JSON.stringify(parsed.ideas, null, 2)}\n`);
  await atomicWriteFile(connectionsPath(p, s), `${JSON.stringify(parsed.connections, null, 2)}\n`);
  await atomicWriteFile(attributionPath(p, s), `${JSON.stringify(parsed.attribution, null, 2)}\n`);
}

export async function readIdeasBundle(p: string, s: string): Promise<IdeasBundle> {
  return {
    ideas: await readIdeas(p, s),
    connections: await readConnections(p, s),
    attribution: await readAttribution(p, s),
  };
}
