import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InferenceService } from "./inference-service";
import type { FetchLike } from "./ollama-health";
import { PromptRegistry } from "./prompt-registry";

const SYNTH = `---
id: synthesis
version: 0.1.0
model: gemma3:4b
temperature: 0.4
top_p: 0.8
top_k: 40
description: test
includes:
  - _shared/h.md
---
SYNTH BODY
`;

const EXPL = `---
id: exploration
version: 0.1.0
model: gemma3:4b
temperature: 1.0
top_p: 0.95
top_k: 64
description: test
includes:
  - _shared/h.md
---
EXPL BODY
`;

let dir: string;
let registry: PromptRegistry;

async function seed() {
  await mkdir(`${dir}/_shared`, { recursive: true });
  await writeFile(`${dir}/synthesis.md`, SYNTH);
  await writeFile(`${dir}/exploration.md`, EXPL);
  await writeFile(`${dir}/_shared/h.md`, "SHARED");
}

function streamingFetch(chunks: object[]): FetchLike {
  return async () => {
    const lines = chunks.map((c) => `${JSON.stringify(c)}\n`).join("");
    return new Response(lines, { status: 200, headers: { "content-type": "application/x-ndjson" } });
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "teambrain-inf-"));
  await seed();
  registry = new PromptRegistry({ promptsDir: dir });
  await registry.load();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("InferenceService", () => {
  test("yields tokens then a done event", async () => {
    const svc = new InferenceService({
      registry,
      ollama_url: "http://x",
      fetcher: streamingFetch([
        { message: { content: "Hello " } },
        { message: { content: "world" } },
        { done: true, prompt_eval_count: 12, eval_count: 5 },
      ]),
    });
    const events: { type: string; content?: string; total_tokens?: number }[] = [];
    for await (const e of svc.run({ persona_id: "synthesis", messages: [{ role: "user", content: "hi" }] })) {
      events.push(e);
    }
    expect(events.filter((e) => e.type === "token").map((e) => e.content).join("")).toBe("Hello world");
    const done = events.find((e) => e.type === "done");
    expect(done?.total_tokens).toBe(17);
  });

  test("prepends persona's composed body to the first user message", async () => {
    let captured = "";
    const svc = new InferenceService({
      registry,
      ollama_url: "http://x",
      fetcher: async (_url, init) => {
        captured = String(init?.body ?? "");
        const ndjson = `${JSON.stringify({ message: { content: "ok" } })}\n${JSON.stringify({ done: true })}\n`;
        return new Response(ndjson);
      },
    });
    for await (const _e of svc.run({ persona_id: "synthesis", messages: [{ role: "user", content: "user-msg" }] })) {
      // drain
    }
    expect(captured).toContain("SHARED");
    expect(captured).toContain("SYNTH BODY");
    expect(captured).toContain("user-msg");
  });

  test("override params shallow-merge over registry defaults", async () => {
    let captured = "";
    const svc = new InferenceService({
      registry,
      ollama_url: "http://x",
      fetcher: async (_u, init) => {
        captured = String(init?.body ?? "");
        return new Response(`${JSON.stringify({ done: true })}\n`);
      },
    });
    for await (const _e of svc.run({
      persona_id: "synthesis",
      messages: [{ role: "user", content: "x" }],
      override: { temperature: 0.1 },
    })) {
      // drain
    }
    const parsed = JSON.parse(captured) as { options: { temperature: number; top_p: number } };
    expect(parsed.options.temperature).toBe(0.1);
    expect(parsed.options.top_p).toBe(0.8); // from registry, not overridden
  });

  test("unknown persona surfaces as error event, not throw", async () => {
    const svc = new InferenceService({ registry, ollama_url: "http://x", fetcher: streamingFetch([]) });
    const events = [];
    for await (const e of svc.run({ persona_id: "ghost", messages: [{ role: "user", content: "x" }] })) {
      events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "error", code: "unknown_persona", message: expect.any(String) as unknown as string });
  });

  test("network failure surfaces as error event", async () => {
    const svc = new InferenceService({
      registry,
      ollama_url: "http://x",
      fetcher: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const events = [];
    for await (const e of svc.run({ persona_id: "synthesis", messages: [{ role: "user", content: "x" }] })) {
      events.push(e);
    }
    expect(events.find((e) => e.type === "error")).toBeDefined();
  });

  test("logger is invoked on completion", async () => {
    let logged: { persona_id: string; prompt_tokens: number; completion_tokens: number } | null = null;
    const svc = new InferenceService({
      registry,
      ollama_url: "http://x",
      logger: { log: (entry) => { logged = entry; } },
      fetcher: streamingFetch([
        { message: { content: "x" } },
        { done: true, prompt_eval_count: 7, eval_count: 3 },
      ]),
    });
    for await (const _e of svc.run({ persona_id: "synthesis", messages: [{ role: "user", content: "x" }] })) {
      // drain
    }
    expect(logged).not.toBeNull();
    expect(logged!.persona_id).toBe("synthesis");
    expect(logged!.prompt_tokens).toBe(7);
    expect(logged!.completion_tokens).toBe(3);
  });

  test("json mode adds format: json to the request", async () => {
    let captured = "";
    const svc = new InferenceService({
      registry,
      ollama_url: "http://x",
      fetcher: async (_u, init) => {
        captured = String(init?.body ?? "");
        return new Response(`${JSON.stringify({ done: true })}\n`);
      },
    });
    for await (const _e of svc.run({
      persona_id: "synthesis",
      messages: [{ role: "user", content: "x" }],
      json: true,
    })) {
      // drain
    }
    expect(JSON.parse(captured).format).toBe("json");
  });

  test("runToString collects tokens and rejects on error", async () => {
    const okSvc = new InferenceService({
      registry,
      ollama_url: "http://x",
      fetcher: streamingFetch([
        { message: { content: "abc" } },
        { message: { content: "def" } },
        { done: true },
      ]),
    });
    expect(
      await okSvc.runToString({ persona_id: "synthesis", messages: [{ role: "user", content: "x" }] }),
    ).toBe("abcdef");

    const failSvc = new InferenceService({
      registry,
      ollama_url: "http://x",
      fetcher: async () => new Response("boom", { status: 500 }),
    });
    await expect(
      failSvc.runToString({ persona_id: "synthesis", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow();
  });
});
