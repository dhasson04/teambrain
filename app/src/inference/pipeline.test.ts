import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDump } from "../vault/dumps";
import { initVault } from "../vault/init";
import { addProfile, makeProfile } from "../vault/profiles";
import { createProject } from "../vault/projects";
import { createSubproject } from "../vault/subprojects";
import { InferenceService, type InferenceEvent, type RunInput } from "./inference-service";
import { PipelineQueue, runPipeline } from "./pipeline";
import { PromptRegistry } from "./prompt-registry";

let dir: string;
let originalVault: string | undefined;

class FakeService extends InferenceService {
  attempts = 0;
  constructor(private readonly responses: string[]) {
    super({
      registry: { get: () => ({}) } as unknown as PromptRegistry,
      ollama_url: "http://x",
    });
  }
  override async runToString(_input: RunInput): Promise<string> {
    const idx = Math.min(this.attempts, this.responses.length - 1);
    this.attempts++;
    return this.responses[idx]!;
  }
  override async *run(_input: RunInput): AsyncGenerator<InferenceEvent> {
    yield { type: "done", total_tokens: 0, duration_ms: 1 };
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "teambrain-pipe-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = dir;
  await initVault();
  await addProfile(makeProfile({ id: "alice", display_name: "Alice" }));
  await createProject("Acme");
  await createSubproject("acme", "Q2");
  await createDump("acme", "q2", "alice", "Step 3 onboarding asks for billing too early.");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(dir, { recursive: true, force: true });
});

describe("runPipeline", () => {
  test("walks extract -> merge -> render and emits done", async () => {
    // Three canned LLM responses: extract, merge, render
    const dumps = await (await import("../vault/dumps")).listDumps("acme", "q2", { includeBody: true });
    const dumpId = (dumps[0] as { id: string }).id;
    const svc = new FakeService([
      // extract
      JSON.stringify({
        ideas: [
          {
            statement: "Billing too early",
            type: "concern",
            evidence_quote: "Step 3 onboarding asks for billing too early.",
            confidence: 0.9,
          },
        ],
      }),
      // merge
      JSON.stringify({
        clusters: [{ cluster_id: "c1", member_idea_ids: [`${dumpId}-i0`] }],
        contradictions: [],
        edges: [],
      }),
      // render — T002/R001: renderer now emits structured JSON; the
      // module assembles markdown server-side.
      JSON.stringify({
        agreed: [
          {
            text: "Billing too early",
            citations: [{ author: "alice", dump_id: dumpId }],
          },
        ],
        disputed: [],
        move_forward: [],
      }),
    ]);

    const events: string[] = [];
    for await (const ev of runPipeline({ service: svc, project: "acme", sub: "q2", modelName: "gemma3:4b" })) {
      events.push(ev.type);
    }
    expect(events).toContain("started");
    expect(events).toContain("extracted");
    expect(events).toContain("merging");
    expect(events).toContain("rendering");
    expect(events).toContain("done");
  });

  test("yields error event when no ideas extracted", async () => {
    // Tell the extractor LLM to return zero ideas every time
    const svc = new FakeService([JSON.stringify({ ideas: [] })]);
    const events: { type: string }[] = [];
    for await (const ev of runPipeline({ service: svc, project: "acme", sub: "q2", modelName: "gemma3:4b" })) {
      events.push({ type: ev.type });
    }
    expect(events.find((e) => e.type === "error")).toBeDefined();
  });

  test("aborts mid-pipeline when signal fires before merge", async () => {
    const ac = new AbortController();
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          {
            statement: "x",
            type: "concern",
            evidence_quote: "Step 3 onboarding asks for billing too early.",
            confidence: 0.5,
          },
        ],
      }),
    ]);
    const events: { type: string }[] = [];
    const gen = runPipeline({ service: svc, project: "acme", sub: "q2", modelName: "gemma3:4b", signal: ac.signal });
    let r = await gen.next();
    while (!r.done) {
      events.push({ type: r.value.type });
      if (r.value.type === "extracted") ac.abort();
      r = await gen.next();
    }
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});

describe("PipelineQueue", () => {
  test("serializes same key, parallelizes different keys", async () => {
    const q = new PipelineQueue();
    const order: string[] = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const a1 = q.run("k1", async () => {
      order.push("k1-a-start");
      await sleep(40);
      order.push("k1-a-end");
    });
    const a2 = q.run("k1", async () => {
      order.push("k1-b-start");
      await sleep(10);
      order.push("k1-b-end");
    });
    const b1 = q.run("k2", async () => {
      order.push("k2-start");
      await sleep(5);
      order.push("k2-end");
    });
    await Promise.all([a1, a2, b1]);
    // Same key: a-start then a-end then b-start then b-end (serial)
    expect(order.indexOf("k1-a-end")).toBeLessThan(order.indexOf("k1-b-start"));
    // Different keys: k2 ran while k1-a was sleeping
    expect(order.indexOf("k2-start")).toBeLessThan(order.indexOf("k1-a-end"));
  });

  test("cancel(key) signals abort to the active job", async () => {
    const q = new PipelineQueue();
    let aborted = false;
    const job = q.run("k", async (signal) => {
      while (!signal.aborted) await new Promise((r) => setTimeout(r, 5));
      aborted = true;
    });
    setTimeout(() => q.cancel("k"), 10);
    await job;
    expect(aborted).toBe(true);
  });

  test("cancel returns false for unknown key", () => {
    const q = new PipelineQueue();
    expect(q.cancel("missing")).toBe(false);
  });
});
