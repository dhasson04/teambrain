export const PROFILE_HEADER = "X-Profile-Id";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

let activeProfileId: string | null = null;

export function setActiveProfileId(id: string | null): void {
  activeProfileId = id;
  if (id) localStorage.setItem("teambrain.profile_id", id);
  else localStorage.removeItem("teambrain.profile_id");
}

export function getActiveProfileId(): string | null {
  if (activeProfileId) return activeProfileId;
  const stored = typeof window !== "undefined" ? localStorage.getItem("teambrain.profile_id") : null;
  if (stored) activeProfileId = stored;
  return activeProfileId;
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip the X-Profile-Id header even on writes (for auth-less reads). */
  skipProfile?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (!opts.skipProfile) {
    const id = getActiveProfileId();
    if (id) headers.set(PROFILE_HEADER, id);
  }
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (typeof opts.body === "string" || opts.body instanceof FormData) {
      body = opts.body;
    } else {
      headers.set("content-type", "application/json");
      body = JSON.stringify(opts.body);
    }
  }
  const res = await fetch(path, { ...opts, headers, body });
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = (await res.json()) as { error?: string };
      detail = errBody.error ?? "";
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Profile {
  id: string;
  display_name: string;
  color: string;
  created: string;
}

export interface ProjectMeta {
  slug: string;
  display_name: string;
  created: string;
  archived: boolean;
}

export interface SubprojectMeta extends ProjectMeta {}

export interface MaterialMeta {
  filename: string;
  bytes: number;
  title: string;
  source: string;
  added_by: string;
  added_at: string;
}

export interface DumpMeta {
  id: string;
  bytes: number;
  hash: string;
  author: string;
  created: string;
  updated: string;
}

export interface DumpFull extends DumpMeta {
  body: string;
}

export interface ProblemDoc {
  data: { updated: string; updated_by: string } | null;
  body: string;
}

export type IdeaType = "theme" | "claim" | "proposal" | "concern" | "question" | "deliverable";

export interface Idea {
  idea_id: string;
  statement: string;
  type: IdeaType;
  cluster_id: string | null;
  contributing_dumps: string[];
  created: string;
}

export type ConnectionKind = "agree" | "contradict" | "related";

export interface Connection {
  edge_id: string;
  from_idea: string;
  to_idea: string;
  kind: ConnectionKind;
  weight: number;
}

export interface AttributionEntry {
  dump_id: string;
  author: string;
  verbatim_quote: string;
}

export type AttributionMap = Record<string, AttributionEntry[]>;

export const apiClient = {
  health: () => api<{ ok: boolean; ollama: string; model_loaded: string | null }>("/api/health", { skipProfile: true }),

  listProfiles: () => api<{ profiles: Profile[] }>("/api/profiles", { skipProfile: true }),
  createProfile: (display_name: string) =>
    api<Profile>("/api/profiles", { method: "POST", body: { display_name }, skipProfile: true }),

  listProjects: () => api<{ projects: ProjectMeta[] }>("/api/projects"),
  createProject: (display_name: string) =>
    api<ProjectMeta>("/api/projects", { method: "POST", body: { display_name } }),
  renameProject: (slug: string, display_name: string) =>
    api<ProjectMeta>(`/api/projects/${slug}`, { method: "PATCH", body: { display_name } }),
  archiveProject: (slug: string) =>
    api<ProjectMeta>(`/api/projects/${slug}`, { method: "DELETE" }),

  listSubprojects: (project: string) =>
    api<{ subprojects: SubprojectMeta[] }>(`/api/projects/${project}/subprojects`),
  createSubproject: (project: string, display_name: string) =>
    api<SubprojectMeta>(`/api/projects/${project}/subprojects`, {
      method: "POST",
      body: { display_name },
    }),

  getProblem: (project: string, sub: string) =>
    api<ProblemDoc>(`/api/projects/${project}/subprojects/${sub}/problem`),
  putProblem: (project: string, sub: string, content: string) =>
    api<{ ok: true }>(`/api/projects/${project}/subprojects/${sub}/problem`, {
      method: "PUT",
      body: { content },
    }),

  listMaterials: (project: string, sub: string) =>
    api<{ materials: MaterialMeta[] }>(`/api/projects/${project}/subprojects/${sub}/materials`),
  addMaterial: (project: string, sub: string, filename: string, content: string) =>
    api<MaterialMeta>(`/api/projects/${project}/subprojects/${sub}/materials`, {
      method: "POST",
      body: { filename, content },
    }),

  listMyDumps: (project: string, sub: string) =>
    api<{ dumps: DumpFull[] }>(`/api/projects/${project}/subprojects/${sub}/dumps?author=me`),
  listAllDumpsMeta: (project: string, sub: string) =>
    api<{ dumps: DumpMeta[] }>(`/api/projects/${project}/subprojects/${sub}/dumps?author=all`),
  createDump: (project: string, sub: string, content: string) =>
    api<DumpFull>(`/api/projects/${project}/subprojects/${sub}/dumps`, {
      method: "POST",
      body: { content },
    }),
  patchDump: (project: string, sub: string, id: string, content: string) =>
    api<DumpFull>(`/api/projects/${project}/subprojects/${sub}/dumps/${id}`, {
      method: "PATCH",
      body: { content },
    }),

  getSynthesis: (project: string, sub: string) =>
    api<{ data: { created: string; dump_count: number; model: string } | null; body: string }>(
      `/api/projects/${project}/subprojects/${sub}/synthesis`,
    ),
  getIdeas: (project: string, sub: string) =>
    api<{ ideas: Idea[] }>(`/api/projects/${project}/subprojects/${sub}/ideas`),
  getConnections: (project: string, sub: string) =>
    api<{ connections: Connection[] }>(`/api/projects/${project}/subprojects/${sub}/connections`),
  getAttribution: (project: string, sub: string) =>
    api<AttributionMap>(`/api/projects/${project}/subprojects/${sub}/attribution`),
};
