import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVaultPath } from "./fs-utils";
import { initVault } from "./init";
import { addProfile, colorForProfileId, makeProfile } from "./profiles";

let tmpRoot: string;
let originalVault: string | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-init-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
});

afterEach(async () => {
  if (originalVault === undefined) {
    delete process.env["TEAMBRAIN_VAULT"];
  } else {
    process.env["TEAMBRAIN_VAULT"] = originalVault;
  }
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("colorForProfileId", () => {
  test("is deterministic", () => {
    expect(colorForProfileId("alice")).toBe(colorForProfileId("alice"));
  });

  test("returns a hex color", () => {
    expect(colorForProfileId("bob")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("initVault", () => {
  test("creates the vault folder, projects/ subdir, and seeds one profile", async () => {
    const res = await initVault();
    expect(res.createdVault).toBe(true);
    expect(res.seededProfile).toBe(true);
    expect((await stat(resolveVaultPath("projects"))).isDirectory()).toBe(true);
    const profilesRaw = await readFile(resolveVaultPath("profiles.json"), "utf8");
    const profilesFile = JSON.parse(profilesRaw) as { profiles: { display_name: string }[] };
    expect(profilesFile.profiles).toHaveLength(1);
    expect(profilesFile.profiles[0]?.display_name).toBe("You");
  });

  test("is idempotent and never overwrites existing profiles", async () => {
    const first = await initVault();
    const profile = makeProfile({ id: "manual-id", display_name: "Manual" });
    await addProfile(profile);
    const second = await initVault();
    expect(first.seededProfile).toBe(true);
    expect(second.seededProfile).toBe(false);
    const raw = await readFile(resolveVaultPath("profiles.json"), "utf8");
    const file = JSON.parse(raw) as { profiles: { id: string }[] };
    expect(file.profiles.map((p) => p.id)).toContain("manual-id");
  });

  test("does not seed a profile when one already exists", async () => {
    const profile = makeProfile({ id: "preexisting", display_name: "Pre" });
    await addProfile(profile);
    const res = await initVault();
    expect(res.seededProfile).toBe(false);
    const raw = await readFile(resolveVaultPath("profiles.json"), "utf8");
    const file = JSON.parse(raw) as { profiles: unknown[] };
    expect(file.profiles).toHaveLength(1);
  });
});

describe("addProfile + uniqueness", () => {
  test("rejects duplicate ids", async () => {
    await initVault();
    const dup = makeProfile({ id: "dup", display_name: "First" });
    await addProfile(dup);
    await expect(addProfile(dup)).rejects.toThrow(/already exists/);
  });
});
