import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { Hono } from "hono";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVaultPath } from "../../vault/fs-utils";
import { initVault } from "../../vault/init";
import { createProject } from "../../vault/projects";
import { addProfile, makeProfile } from "../../vault/profiles";
import { PROFILE_HEADER } from "../middleware/auth";
import { subprojectsRoutes } from "./subprojects";

let tmpRoot: string;
let originalVault: string | undefined;
const PID = "tester";

function buildApp() {
  const app = new Hono();
  app.route("/api", subprojectsRoutes());
  return app;
}

const headers = () => ({
  [PROFILE_HEADER]: PID,
  "content-type": "application/json",
});

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-sub-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
  await addProfile(makeProfile({ id: PID, display_name: "Tester" }));
  await createProject("Acme");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("subprojects API", () => {
  test("POST creates subproject with required subdirs", async () => {
    const res = await buildApp().request("/api/projects/acme/subprojects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Q2 Strategy" }),
    });
    expect(res.status).toBe(201);
    const meta = (await res.json()) as { slug: string };
    expect(meta.slug).toBe("q2-strategy");
    for (const d of ["materials", "dumps", "ideas", "synthesis", "synthesis/history", ".cache"]) {
      const path = resolveVaultPath("projects", "acme", "subprojects", "q2-strategy", d);
      expect((await stat(path)).isDirectory()).toBe(true);
    }
  });

  test("POST returns 404 when parent project is missing", async () => {
    const res = await buildApp().request("/api/projects/ghost/subprojects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "X" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST slug collision returns 409", async () => {
    const app = buildApp();
    await app.request("/api/projects/acme/subprojects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Q2" }),
    });
    const res = await app.request("/api/projects/acme/subprojects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Q2" }),
    });
    expect(res.status).toBe(409);
  });

  test("POST returns 401 without X-Profile-Id", async () => {
    const res = await buildApp().request("/api/projects/acme/subprojects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "X" }),
    });
    expect(res.status).toBe(401);
  });

  test("GET / lists, GET /:sub returns single, DELETE soft-deletes", async () => {
    const app = buildApp();
    await app.request("/api/projects/acme/subprojects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Alpha" }),
    });
    const list = (await (await app.request("/api/projects/acme/subprojects")).json()) as { subprojects: { slug: string }[] };
    expect(list.subprojects.map((s) => s.slug)).toEqual(["alpha"]);

    const single = await app.request("/api/projects/acme/subprojects/alpha");
    expect(single.status).toBe(200);

    await app.request("/api/projects/acme/subprojects/alpha", {
      method: "DELETE",
      headers: headers(),
    });
    const list2 = (await (await app.request("/api/projects/acme/subprojects")).json()) as { subprojects: unknown[] };
    expect(list2.subprojects).toEqual([]);
    // folder still exists on disk
    expect(existsSync(resolveVaultPath("projects", "acme", "subprojects", "alpha"))).toBe(true);
  });

  test("PATCH renames but keeps slug", async () => {
    const app = buildApp();
    await app.request("/api/projects/acme/subprojects", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ display_name: "Beta" }),
    });
    const res = await app.request("/api/projects/acme/subprojects/beta", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ display_name: "Beta v2" }),
    });
    const meta = (await res.json()) as { slug: string; display_name: string };
    expect(meta.slug).toBe("beta");
    expect(meta.display_name).toBe("Beta v2");
  });
});
