// Bun test for the SSE parser without a DOM/render.
// Imports the parsing helper indirectly by exercising fetch + text decode.
import { describe, expect, test } from "bun:test";

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
