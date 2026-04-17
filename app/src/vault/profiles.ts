import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { atomicWriteFile, getVaultRoot, resolveVaultPath } from "./fs-utils";

export interface Profile {
  id: string;
  display_name: string;
  color: string;
  created: string;
}

export interface ProfilesFile {
  profiles: Profile[];
}

const PROFILE_PALETTE = [
  "#a78bfa",
  "#c2553d",
  "#6a9b7a",
  "#6a8db8",
  "#d4a76a",
  "#c66b6b",
  "#9c7ad4",
  "#7aa3a6",
];

/**
 * Deterministic color from a profile id.
 * Same id always returns the same palette entry; profile order in
 * the file does not change colors.
 */
export function colorForProfileId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PROFILE_PALETTE.length;
  return PROFILE_PALETTE[idx] ?? PROFILE_PALETTE[0]!;
}

function profilesPath(): string {
  return resolveVaultPath("profiles.json");
}

export async function loadProfiles(): Promise<ProfilesFile> {
  const path = profilesPath();
  if (!existsSync(path)) {
    return { profiles: [] };
  }
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as ProfilesFile;
}

export async function saveProfiles(file: ProfilesFile): Promise<void> {
  await atomicWriteFile(profilesPath(), `${JSON.stringify(file, null, 2)}\n`);
}

export interface NewProfileInput {
  id: string;
  display_name: string;
}

export function makeProfile(input: NewProfileInput): Profile {
  return {
    id: input.id,
    display_name: input.display_name,
    color: colorForProfileId(input.id),
    created: new Date().toISOString(),
  };
}

export async function addProfile(profile: Profile): Promise<ProfilesFile> {
  const file = await loadProfiles();
  if (file.profiles.some((p) => p.id === profile.id)) {
    throw new Error(`profile id already exists: ${profile.id}`);
  }
  file.profiles.push(profile);
  await saveProfiles(file);
  return file;
}

export async function findProfile(id: string): Promise<Profile | null> {
  const file = await loadProfiles();
  return file.profiles.find((p) => p.id === id) ?? null;
}
