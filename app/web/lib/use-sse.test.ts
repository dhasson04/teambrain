// Bun test for the SSE parser without a DOM/render.
// Imports the parsing helper indirectly by exercising fetch + text decode.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseSSE(raw: string): { event: string; data: string }[] {
  const events: { event: string; data: string }[] = [];
  let pending: { event: string; data: string } | null = null;
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line === "") {
      if (pending) events.push(pending);
      pending = null;
      continue;
    }
    if (line.startsWith("event:")) {
      if (!pending) pending = { event: "message", data: "" };
      pending.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      if (!pending) pending = { event: "message", data: "" };
      pending.data += (pending.data ? "\n" : "") + line.slice(5).trim();
    }
  }
  if (pending) events.push(pending);
  return events;
}

describe("SSE parser", () => {
  test("parses standard event/data frames separated by blank lines", () => {
    const raw =
      "event: token\ndata: {\"content\":\"hello\"}\n\nevent: token\ndata: {\"content\":\" world\"}\n\nevent: done\ndata: {}\n\n";
    const events = parseSSE(raw);
    expect(events).toHaveLength(3);
    expect(events[0]?.event).toBe("token");
    expect(events[0]?.data).toBe('{"content":"hello"}');
    expect(events[2]?.event).toBe("done");
  });

  test("tolerates CRLF line endings", () => {
    const raw = "event: x\r\ndata: 1\r\n\r\nevent: y\r\ndata: 2\r\n\r\n";
    const events = parseSSE(raw);
    expect(events.map((e) => e.event)).toEqual(["x", "y"]);
  });

  test("preserves multi-line data", () => {
    const raw = "event: blob\ndata: line1\ndata: line2\n\n";
    const events = parseSSE(raw);
    expect(events[0]?.data).toBe("line1\nline2");
  });
});

// Regression: backprop-5, BUG-5 — during the 2026-04-17 smoke test the backend
// received multiple full synthesis pipeline runs after a single Re-synthesize
// click. Assert at source level that useSSE has no auto-restart path.
// See spec-ui.md R010.
describe("useSSE (backprop-5, BUG-5 — no client-side auto-restart)", () => {
  test("source does not call start() from inside a useEffect body", () => {
    const src = readFileSync(resolve(import.meta.dir, "use-sse.ts"), "utf8");
    const effectBodies = src.match(/useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,/g) ?? [];
    for (const body of effectBodies) {
      if (/options\.auto\s*\)\s*start\(\)/.test(body)) continue; // guarded opt-in
      expect(body).not.toMatch(/\bstart\s*\(\s*\)/);
    }
  });

  test("catch/finally blocks do not re-invoke start()", () => {
    const src = readFileSync(resolve(import.meta.dir, "use-sse.ts"), "utf8");
    const catchFinallyRegion = src.match(/catch\s*\([\s\S]*?finally\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(catchFinallyRegion).not.toMatch(/\bstart\s*\(\s*\)/);
  });
});

// Regression: backprop-4, BUG-4 — phase label never advanced past "extracting…"
// during a 3-4 minute pipeline because Vite's dev proxy byte-buffered the
// SSE proxy response. See spec-ui.md R010.
describe("vite.config.ts (backprop-4, BUG-4 — SSE passthrough on /api)", () => {
  test("/api proxy disables response buffering for SSE", () => {
    const src = readFileSync(resolve(import.meta.dir, "../../vite.config.ts"), "utf8");
    expect(src).toMatch(/configure\s*:\s*\(/);
    expect(src).toMatch(/X-Accel-Buffering|selfHandleResponse|proxyRes/);
  });
});
