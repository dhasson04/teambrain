import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../../vault/init";
import { createProject } from "../../vault/projects";
import { createSubproject } from "../../vault/subprojects";
import { addProfile, makeProfile } from "../../vault/profiles";
import { PROFILE_HEADER } from "../middleware/auth";
import { materialsRoutes } from "./materials";

let tmpRoot: string;
let originalVault: string | undefined;
const PID = "tester";

function buildApp() {
  const app = new Hono();
  app.route("/api", materialsRoutes());
  return app;
}

const headers = () => ({
  [PROFILE_HEADER]: PID,
  "content-type": "application/json",
});

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-mat-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
  await addProfile(makeProfile({ id: PID, display_name: "Tester" }));
  await createProject("Acme");
  await createSubproject("acme", "Q2 Strategy");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("problem statement", () => {
  test("PUT then GET round-trips body and frontmatter", async () => {
    const app = buildApp();
    const put = await app.request("/api/projects/acme/subprojects/q2-strategy/problem", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ content: "We need to figure out the launch." }),
    });
    expect(put.status).toBe(200);

    const get = await app.request("/api/projects/acme/subprojects/q2-strategy/problem");
    expect(get.status).toBe(200);
    const out = (await get.json()) as { data: { updated_by: string }; body: string };
    expect(out.data.updated_by).toBe(PID);
    expect(out.body).toContain("We need to figure out the launch.");
  });

  test("PUT requires X-Profile-Id", async () => {
    const res = await buildApp().request("/api/projects/acme/subprojects/q2-strategy/problem", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("PUT on missing subproject returns 404", async () => {
    const res = await buildApp().request("/api/projects/acme/subprojects/ghost/problem", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ content: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("materials", () => {
  test("POST creates with frontmatter, GET returns body, list excludes content", async () => {
    const app = buildApp();
    const post = await app.request("/api/projects/acme/subprojects/q2-strategy/materials", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ filename: "Meeting Notes.md", content: "hello" }),
    });
    expect(post.status).toBe(201);
    const meta = (await post.json()) as { filename: string; title: string };
    expect(meta.filename).toBe("meeting-notes.md");
    expect(meta.title).toBe("Meeting Notes");

    const get = await app.request(
      "/api/projects/acme/subprojects/q2-strategy/materials/meeting-notes.md",
    );
    expect(get.status).toBe(200);
    const full = (await get.json()) as { meta: { added_by: string }; body: string };
    expect(full.meta.added_by).toBe(PID);
    expect(full.body.trim()).toBe("hello");

    const list = (await (
      await app.request("/api/projects/acme/subprojects/q2-strategy/materials")
    ).json()) as { materials: { filename: string }[] };
    expect(list.materials.map((m) => m.filename)).toEqual(["meeting-notes.md"]);
  });

  test("collision suffixes -2, -3", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      const r = await app.request("/api/projects/acme/subprojects/q2-strategy/materials", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ filename: "Notes.md", content: `n${i}` }),
      });
      expect(r.status).toBe(201);
    }
    const list = (await (
      await app.request("/api/projects/acme/subprojects/q2-strategy/materials")
    ).json()) as { materials: { filename: string }[] };
    const names = list.materials.map((m) => m.filename).sort();
    expect(names).toEqual(["notes-2.md", "notes-3.md", "notes.md"]);
  });

  test("rejects extensions other than .md / .txt", async () => {
    const res = await buildApp().request(
      "/api/projects/acme/subprojects/q2-strategy/materials",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ filename: "image.png", content: "bin" }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("accepts .txt, normalizes to .md", async () => {
    const res = await buildApp().request(
      "/api/projects/acme/subprojects/q2-strategy/materials",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ filename: "raw.txt", content: "plaintext" }),
      },
    );
    expect(res.status).toBe(201);
    const meta = (await res.json()) as { filename: string };
    expect(meta.filename).toBe("raw.md");
  });
});
