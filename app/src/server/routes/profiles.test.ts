import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../../vault/init";
import { addProfile, makeProfile } from "../../vault/profiles";
import { PROFILE_HEADER, requireProfile } from "../middleware/auth";
import { profilesRoutes } from "./profiles";

let tmpRoot: string;
let originalVault: string | undefined;

function buildApp() {
  const app = new Hono();
  app.route("/api/profiles", profilesRoutes());
  app.post("/api/protected", requireProfile, (c) =>
    c.json({ ok: true, profileId: c.var.profileId }),
  );
  return app;
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-profiles-route-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
});

afterEach(async () => {
  if (originalVault === undefined) {
    delete process.env["TEAMBRAIN_VAULT"];
  } else {
    process.env["TEAMBRAIN_VAULT"] = originalVault;
  }
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("GET /api/profiles", () => {
  test("returns the current profiles file (seeded by initVault)", async () => {
    const app = buildApp();
    const res = await app.request("/api/profiles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profiles: { display_name: string }[] };
    expect(body.profiles.length).toBeGreaterThanOrEqual(1);
    expect(body.profiles[0]?.display_name).toBe("You");
  });
});

describe("POST /api/profiles", () => {
  test("creates a profile with auto-assigned uuid + color", async () => {
    const app = buildApp();
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Alice" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      display_name: string;
      color: string;
      created: string;
    };
    expect(body.display_name).toBe("Alice");
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(body.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("rejects missing display_name with 400", async () => {
    const app = buildApp();
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty display_name with 400", async () => {
    const app = buildApp();
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "   " }),
    });
    expect(res.status).toBe(400);
  });
});

describe("requireProfile middleware", () => {
  test("returns 401 when X-Profile-Id header is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/protected", { method: "POST" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("missing");
  });

  test("returns 401 when X-Profile-Id is unknown", async () => {
    const app = buildApp();
    const res = await app.request("/api/protected", {
      method: "POST",
      headers: { [PROFILE_HEADER]: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("unknown");
  });

  test("passes through and exposes profileId when header is valid", async () => {
    const profile = makeProfile({ id: "valid-profile-id", display_name: "Bob" });
    await addProfile(profile);

    const app = buildApp();
    const res = await app.request("/api/protected", {
      method: "POST",
      headers: { [PROFILE_HEADER]: profile.id },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; profileId: string };
    expect(body.profileId).toBe(profile.id);
  });
});
