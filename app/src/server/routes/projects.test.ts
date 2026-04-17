import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../../vault/init";
import { addProfile, makeProfile } from "../../vault/profiles";
import { PROFILE_HEADER } from "../middleware/auth";
import { projectsRoutes } from "./projects";

let tmpRoot: string;
let originalVault: string | undefined;
let profileId: string;

function buildApp() {
  const app = new Hono();
  app.route("/api/projects", projectsRoutes());
  return app;
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-projects-route-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
  profileId = "test-profile";
  await addProfile(makeProfile({ id: profileId, display_name: "Tester" }));
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

const auth = { [PROFILE_HEADER]: () => profileId };
const headers = (extra: Record<string, string> = {}) => ({
  [PROFILE_HEADER]: profileId,
  "content-type": "application/json",
  ...extra,
});

describe("projects API", () => {
  test("GET / returns empty list initially", async () => {
    const res = await buildApp().request("/api/projects");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: unknown[] };
    expect(body.projects).toEqual([]);
  });

  test("POST / creates a project with derived slug", async () => {
    const res = await buildApp().request("/api/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Acme Corp" }),
    });
    expect(res.status).toBe(201);
    const meta = (await res.json()) as { slug: string; display_name: string; archived: boolean };
    expect(meta.slug).toBe("acme-corp");
    expect(meta.display_name).toBe("Acme Corp");
    expect(meta.archived).toBe(false);
  });

  test("POST / returns 409 on slug collision", async () => {
    const app = buildApp();
    await app.request("/api/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Acme" }),
    });
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "ACME" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("acme");
  });

  test("POST / returns 401 without X-Profile-Id", async () => {
    const res = await buildApp().request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Acme" }),
    });
    expect(res.status).toBe(401);
  });

  test("PATCH / renames but keeps slug", async () => {
    const app = buildApp();
    await app.request("/api/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Acme" }),
    });
    const res = await app.request("/api/projects/acme", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ display_name: "Acme Worldwide" }),
    });
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { slug: string; display_name: string };
    expect(meta.slug).toBe("acme");
    expect(meta.display_name).toBe("Acme Worldwide");
  });

  test("DELETE / soft-deletes (sets archived=true) and excludes from list", async () => {
    const app = buildApp();
    await app.request("/api/projects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Beta" }),
    });
    const del = await app.request("/api/projects/beta", {
      method: "DELETE",
      headers: headers(),
    });
    expect(del.status).toBe(200);
    const meta = (await del.json()) as { archived: boolean };
    expect(meta.archived).toBe(true);

    const list = await app.request("/api/projects");
    const body = (await list.json()) as { projects: unknown[] };
    expect(body.projects).toEqual([]);
  });

  test("PATCH and DELETE on missing slug return 404", async () => {
    const app = buildApp();
    const patch = await app.request("/api/projects/ghost", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ display_name: "ghost" }),
    });
    expect(patch.status).toBe(404);
    const del = await app.request("/api/projects/ghost", {
      method: "DELETE",
      headers: headers(),
    });
    expect(del.status).toBe(404);
  });
});

void auth;
