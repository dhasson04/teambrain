import { randomUUID } from "node:crypto";
import { ensureDir, getVaultRoot, resolveVaultPath } from "./fs-utils";
import { loadProfiles, makeProfile, saveProfiles } from "./profiles";

export interface VaultInitResult {
  vaultRoot: string;
  createdVault: boolean;
  seededProfile: boolean;
}

const DEFAULT_PROFILE_NAME = "You";

/**
 * Idempotent vault bootstrap. Creates the vault root if missing and
 * seeds profiles.json with a single default profile so the app is
 * usable immediately after install. Existing vaults are left intact.
 */
export async function initVault(): Promise<VaultInitResult> {
  const vaultRoot = getVaultRoot();

  const beforeProfiles = await loadProfiles();
  const vaultExisted = beforeProfiles.profiles.length > 0;

  await ensureDir(vaultRoot);
  await ensureDir(resolveVaultPath("projects"));

  let seededProfile = false;
  const profiles = await loadProfiles();
  if (profiles.profiles.length === 0) {
    const profile = makeProfile({ id: randomUUID(), display_name: DEFAULT_PROFILE_NAME });
    await saveProfiles({ profiles: [profile] });
    seededProfile = true;
  }

  return {
    vaultRoot,
    createdVault: !vaultExisted,
    seededProfile,
  };
}
