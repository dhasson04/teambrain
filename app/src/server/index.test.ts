import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  // Regression: backprop-3, BUG-1 — Bun.serve default idleTimeout=10s killed SSE
  // mid-run on slow GPUs. See spec-synthesis.md R009.
  test("Bun.serve is configured with idleTimeout: 0 for long-lived SSE", () => {
    const src = readFileSync(resolve(import.meta.dir, "index.ts"), "utf8");
    expect(src).toMatch(/Bun\.serve\(\s*\{[^}]*idleTimeout:\s*0[^}]*\}/s);
  });
});
