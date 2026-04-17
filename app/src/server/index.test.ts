import { describe, expect, test } from "bun:test";
import { createApp } from "./index";

describe("server scaffolding", () => {
  test("createApp returns a Hono instance with /api/health", async () => {
    const app = createApp();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string; version: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("teambrain");
    expect(body.version).toBe("0.1.0");
  });

  test("unknown route returns 404", async () => {
    const app = createApp();
    const res = await app.request("/api/does-not-exist");
    expect(res.status).toBe(404);
  });
});
