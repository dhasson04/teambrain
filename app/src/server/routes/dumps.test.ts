import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVaultPath } from "../../vault/fs-utils";
import { initVault } from "../../vault/init";
import { createProject } from "../../vault/projects";
import { createSubproject } from "../../vault/subprojects";
import { addProfile, makeProfile } from "../../vault/profiles";
import { PROFILE_HEADER } from "../middleware/auth";
import { dumpsRoutes } from "./dumps";

let tmpRoot: string;
let originalVault: string | undefined;
const ALICE = "alice";
const BOB = "bob";

function buildApp() {
  const app = new Hono();
  app.route("/api", dumpsRoutes());
  return app;
}

const headers = (id: string) => ({ [PROFILE_HEADER]: id, "content-type": "application/json" });

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-dumps-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = tmpRoot;
  await initVault();
  await addProfile(makeProfile({ id: ALICE, display_name: "Alice" }));
  await addProfile(makeProfile({ id: BOB, display_name: "Bob" }));
  await createProject("Acme");
  await createSubproject("acme", "Q2");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("dumps", () => {
  test("POST creates dump for current profile + writes chunk hash", async () => {
    const res = await buildApp().request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "alice thinks X" }),
    });
    expect(res.status).toBe(201);
    const dump = (await res.json()) as { id: string; author: string; hash: string };
    expect(dump.author).toBe(ALICE);
    expect(dump.hash).toMatch(/^[0-9a-f]{64}$/);

    const hashes = JSON.parse(
      await readFile(resolveVaultPath("projects", "acme", "subprojects", "q2", ".cache", "chunk-hashes.json"), "utf8"),
    ) as Record<string, string>;
    expect(hashes[dump.id]).toBe(dump.hash);
  });

  test("GET ?author=me returns only own dumps with body", async () => {
    const app = buildApp();
    await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "alice secret" }),
    });
    await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(BOB),
      body: JSON.stringify({ content: "bob secret" }),
    });
    const res = await app.request("/api/projects/acme/subprojects/q2/dumps?author=me", {
      headers: headers(ALICE),
    });
    const body = (await res.json()) as { dumps: { author: string; body?: string }[] };
    expect(body.dumps).toHaveLength(1);
    expect(body.dumps[0]?.author).toBe(ALICE);
    expect(body.dumps[0]?.body).toContain("alice secret");
  });

  test("GET ?author=all returns metadata only (no body) for any caller", async () => {
    const app = buildApp();
    await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "alice text" }),
    });
    await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(BOB),
      body: JSON.stringify({ content: "bob text" }),
    });
    const res = await app.request("/api/projects/acme/subprojects/q2/dumps?author=all", {
      headers: headers(ALICE),
    });
    const body = (await res.json()) as { dumps: Array<Record<string, unknown>> };
    expect(body.dumps).toHaveLength(2);
    for (const d of body.dumps) {
      expect((d as { body?: string }).body).toBeUndefined();
    }
  });

  test("PATCH another author's dump returns 403", async () => {
    const app = buildApp();
    const post = await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "alice" }),
    });
    const dump = (await post.json()) as { id: string };
    const patch = await app.request(`/api/projects/acme/subprojects/q2/dumps/${dump.id}`, {
      method: "PATCH",
      headers: headers(BOB),
      body: JSON.stringify({ content: "bob hacking" }),
    });
    expect(patch.status).toBe(403);
  });

  test("DELETE another author's dump returns 403", async () => {
    const app = buildApp();
    const post = await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "alice" }),
    });
    const dump = (await post.json()) as { id: string };
    const del = await app.request(`/api/projects/acme/subprojects/q2/dumps/${dump.id}`, {
      method: "DELETE",
      headers: headers(BOB),
    });
    expect(del.status).toBe(403);
  });

  test("PATCH own dump succeeds and updates hash + updated timestamp", async () => {
    const app = buildApp();
    const post = await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "v1" }),
    });
    const created = (await post.json()) as { id: string; hash: string };
    const patch = await app.request(`/api/projects/acme/subprojects/q2/dumps/${created.id}`, {
      method: "PATCH",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "v2" }),
    });
    const updated = (await patch.json()) as { hash: string };
    expect(updated.hash).not.toBe(created.hash);
  });

  test("GET single by id strips body when not the author", async () => {
    const app = buildApp();
    const post = await app.request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: headers(ALICE),
      body: JSON.stringify({ content: "private" }),
    });
    const created = (await post.json()) as { id: string };
    const res = await app.request(`/api/projects/acme/subprojects/q2/dumps/${created.id}`, {
      headers: headers(BOB),
    });
    expect(res.status).toBe(200);
    const dump = (await res.json()) as Record<string, unknown>;
    expect(dump["body"]).toBeUndefined();
    expect(dump["hash"]).toBeDefined();
  });

  test("any dumps endpoint requires X-Profile-Id", async () => {
    const res = await buildApp().request("/api/projects/acme/subprojects/q2/dumps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    expect(res.status).toBe(401);
  });
});
