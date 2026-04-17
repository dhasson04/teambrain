import { useEffect, useSyncExternalStore } from "react";
import { apiClient, type Profile, type ProjectMeta, type SubprojectMeta } from "./api";
import { getActiveProfileId, setActiveProfileId } from "./api";

/**
 * Tiny pub/sub store. We avoid a heavy state library because the data model is
 * already file-system backed and most state is server-derived.
 */
function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: T) => {
      state = next;
      listeners.forEach((l) => l());
    },
    update: (fn: (s: T) => T) => {
      state = fn(state);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

interface ProfilesState {
  profiles: Profile[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
}

export const profilesStore = createStore<ProfilesState>({
  profiles: [],
  activeId: getActiveProfileId(),
  loading: false,
  error: null,
});

export async function loadProfiles(): Promise<void> {
  profilesStore.update((s) => ({ ...s, loading: true, error: null }));
  try {
    const { profiles } = await apiClient.listProfiles();
    profilesStore.update((s) => ({
      ...s,
      profiles,
      loading: false,
      activeId: s.activeId && profiles.some((p) => p.id === s.activeId) ? s.activeId : profiles[0]?.id ?? null,
    }));
    const id = profilesStore.get().activeId;
    setActiveProfileId(id);
  } catch (e) {
    profilesStore.update((s) => ({ ...s, loading: false, error: (e as Error).message }));
  }
}

export function selectProfile(id: string): void {
  profilesStore.update((s) => ({ ...s, activeId: id }));
  setActiveProfileId(id);
}

export async function createProfile(displayName: string): Promise<void> {
  const profile = await apiClient.createProfile(displayName);
  profilesStore.update((s) => ({ ...s, profiles: [...s.profiles, profile], activeId: profile.id }));
  setActiveProfileId(profile.id);
}

export interface DirectionTab {
  tab_id: string;
  project: string;
  name: string;
  created: string;
}

interface ProjectsState {
  projects: ProjectMeta[];
  subprojectsByProject: Record<string, SubprojectMeta[]>;
  expanded: Record<string, boolean>;
  activeProject: string | null;
  activeSub: string | null;
  activeDirection: string | null;
  directionsByProject: Record<string, DirectionTab[]>;
  loading: boolean;
}

function loadDirections(): Record<string, DirectionTab[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("teambrain.directions") ?? "{}") as Record<string, DirectionTab[]>;
  } catch {
    return {};
  }
}

function saveDirections(map: Record<string, DirectionTab[]>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("teambrain.directions", JSON.stringify(map));
}

export const projectsStore = createStore<ProjectsState>({
  projects: [],
  subprojectsByProject: {},
  expanded: JSON.parse(typeof window !== "undefined" ? localStorage.getItem("teambrain.expanded") ?? "{}" : "{}"),
  activeProject: null,
  activeSub: null,
  activeDirection: null,
  directionsByProject: loadDirections(),
  loading: false,
});

function persistExpanded() {
  if (typeof window === "undefined") return;
  localStorage.setItem("teambrain.expanded", JSON.stringify(projectsStore.get().expanded));
}

export async function loadProjects(): Promise<void> {
  projectsStore.update((s) => ({ ...s, loading: true }));
  const { projects } = await apiClient.listProjects();
  projectsStore.update((s) => ({ ...s, projects, loading: false }));
}

export async function loadSubprojects(project: string): Promise<void> {
  const { subprojects } = await apiClient.listSubprojects(project);
  projectsStore.update((s) => ({
    ...s,
    subprojectsByProject: { ...s.subprojectsByProject, [project]: subprojects },
  }));
}

export function toggleExpanded(project: string): void {
  projectsStore.update((s) => ({
    ...s,
    expanded: { ...s.expanded, [project]: !s.expanded[project] },
  }));
  persistExpanded();
  if (projectsStore.get().expanded[project]) void loadSubprojects(project);
}

export function selectSubproject(project: string, sub: string): void {
  projectsStore.update((s) => ({ ...s, activeProject: project, activeSub: sub, activeDirection: null }));
}

export function selectDirection(project: string, tabId: string): void {
  projectsStore.update((s) => ({ ...s, activeProject: project, activeSub: null, activeDirection: tabId }));
}

export function createDirection(project: string, name: string): DirectionTab {
  const tab: DirectionTab = {
    tab_id: `dir-${Math.random().toString(36).slice(2, 10)}`,
    project,
    name,
    created: new Date().toISOString(),
  };
  projectsStore.update((s) => {
    const list = s.directionsByProject[project] ?? [];
    const next = { ...s.directionsByProject, [project]: [...list, tab] };
    saveDirections(next);
    return { ...s, directionsByProject: next };
  });
  return tab;
}

export function closeDirection(project: string, tabId: string): void {
  projectsStore.update((s) => {
    const list = (s.directionsByProject[project] ?? []).filter((d) => d.tab_id !== tabId);
    const next = { ...s.directionsByProject, [project]: list };
    saveDirections(next);
    return {
      ...s,
      directionsByProject: next,
      activeDirection: s.activeDirection === tabId ? null : s.activeDirection,
    };
  });
}

export async function createProject(displayName: string): Promise<void> {
  const project = await apiClient.createProject(displayName);
  projectsStore.update((s) => ({ ...s, projects: [...s.projects, project] }));
}

export async function createSubproject(project: string, displayName: string): Promise<void> {
  const sub = await apiClient.createSubproject(project, displayName);
  projectsStore.update((s) => {
    const list = s.subprojectsByProject[project] ?? [];
    return {
      ...s,
      subprojectsByProject: { ...s.subprojectsByProject, [project]: [...list, sub] },
    };
  });
}

/* React bindings */

export function useProfilesStore(): ProfilesState {
  return useSyncExternalStore(profilesStore.subscribe, profilesStore.get, profilesStore.get);
}

export function useProjectsStore(): ProjectsState {
  return useSyncExternalStore(projectsStore.subscribe, projectsStore.get, projectsStore.get);
}

/** Convenience: load profiles + projects on first mount of the app shell. */
export function useBootstrap(): void {
  useEffect(() => {
    void (async () => {
      await loadProfiles();
      try {
        await loadProjects();
      } catch {
        /* projects fetch needs profile; ignore until one is selected */
      }
    })();
  }, []);
}
