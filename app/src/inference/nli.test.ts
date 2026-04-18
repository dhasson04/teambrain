import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InferenceService } from "./inference-service";
import {
  classifyPair,
  findContradictionCandidates,
  NLI_SCHEMA,
  type NliLabel,
} from "./nli";
import type { FetchLike } from "./ollama-health";
import { PromptRegistry } from "./prompt-registry";

const SYNTH_PROMPT = `---
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

async function seedRegistry(dir: string): Promise<PromptRegistry> {
  await mkdir(`${dir}/_shared`, { recursive: true });
  await writeFile(`${dir}/synthesis.md`, SYNTH_PROMPT);
  await writeFile(`${dir}/_shared/h.md`, "SHARED");
  const registry = new PromptRegistry({ promptsDir: dir });
  await registry.load();
  return registry;
}

/**
 * Fetcher that captures every request body sent to Ollama and responds with
 * a streaming NDJSON payload containing the supplied label/confidence.
 */
function mockOllamaFetch(
  label: NliLabel,
  confidence: number,
  capturedBodies: unknown[],
): FetchLike {
  return async (_url, init) => {
    capturedBodies.push(JSON.parse((init?.body as string) ?? "{}"));
    const json = JSON.stringify({ label, confidence });
    const chunks = [
      { message: { content: json } },
      { done: true, prompt_eval_count: 10, eval_count: 5 },
    ];
    const body = chunks.map((c) => `${JSON.stringify(c)}\n`).join("");
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    });
  };
}

async function withRegistry<T>(fn: (registry: PromptRegistry) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "teambrain-nli-"));
  try {
    const registry = await seedRegistry(dir);
    return await fn(registry);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("classifyPair (NLI via Ollama + enum JSON, R001)", () => {
  test("sends a request whose format.properties.label.enum is [contradict, entail, neutral]", async () => {
    await withRegistry(async (registry) => {
      const captured: unknown[] = [];
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("contradict", 0.9, captured),
      });
      await classifyPair(svc, "We ship May 1.", "Push launch past May.");
      expect(captured).toHaveLength(1);
      const body = captured[0] as { format?: { properties?: { label?: { enum?: string[] } } } };
      expect(body.format?.properties?.label?.enum).toEqual(["contradict", "entail", "neutral"]);
    });
  });

  test("passes temperature: 0 to Ollama for determinism", async () => {
    await withRegistry(async (registry) => {
      const captured: unknown[] = [];
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("entail", 0.8, captured),
      });
      await classifyPair(svc, "p", "h");
      const body = captured[0] as { options?: { temperature?: number } };
      expect(body.options?.temperature).toBe(0);
    });
  });

  test("derives NliScores from single-label response: emitted label gets confidence, others get (1 - c) / 2", async () => {
    await withRegistry(async (registry) => {
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("contradict", 0.8, []),
      });
      const scores = await classifyPair(svc, "p", "h");
      expect(scores.contradiction).toBeCloseTo(0.8, 5);
      expect(scores.entailment).toBeCloseTo(0.1, 5);
      expect(scores.neutral).toBeCloseTo(0.1, 5);
    });
  });

  test("entail label routes confidence into the entailment slot", async () => {
    await withRegistry(async (registry) => {
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("entail", 0.7, []),
      });
      const scores = await classifyPair(svc, "p", "h");
      expect(scores.entailment).toBeCloseTo(0.7, 5);
      expect(scores.contradiction).toBeCloseTo(0.15, 5);
      expect(scores.neutral).toBeCloseTo(0.15, 5);
    });
  });

  test("neutral label routes confidence into the neutral slot", async () => {
    await withRegistry(async (registry) => {
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("neutral", 0.6, []),
      });
      const scores = await classifyPair(svc, "p", "h");
      expect(scores.neutral).toBeCloseTo(0.6, 5);
      expect(scores.contradiction).toBeCloseTo(0.2, 5);
      expect(scores.entailment).toBeCloseTo(0.2, 5);
    });
  });

  test("throws when Ollama returns non-JSON", async () => {
    await withRegistry(async (registry) => {
      const badFetch: FetchLike = async () => {
        const chunks = [
          { message: { content: "not-json-at-all" } },
          { done: true, prompt_eval_count: 1, eval_count: 1 },
        ];
        const body = chunks.map((c) => `${JSON.stringify(c)}\n`).join("");
        return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
      };
      const svc = new InferenceService({ registry, ollama_url: "http://x", fetcher: badFetch });
      await expect(classifyPair(svc, "p", "h")).rejects.toThrow(/not valid JSON/i);
    });
  });
});

describe("NLI_SCHEMA shape", () => {
  test("is a proper JSON Schema object with the three-label enum and number confidence", () => {
    expect(NLI_SCHEMA.type).toBe("object");
    expect(NLI_SCHEMA.properties.label.enum).toEqual(["contradict", "entail", "neutral"]);
    expect(NLI_SCHEMA.properties.confidence.type).toBe("number");
    expect(NLI_SCHEMA.required).toContain("label");
    expect(NLI_SCHEMA.required).toContain("confidence");
  });
});

describe("findContradictionCandidates (R003 bi-directional + margin guards)", () => {
  test("returns [] for an empty input list without calling Ollama", async () => {
    await withRegistry(async (registry) => {
      let calls = 0;
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: (async () => {
          calls++;
          return new Response("", { status: 500 });
        }) as FetchLike,
      });
      const out = await findContradictionCandidates(svc, []);
      expect(out).toEqual([]);
      expect(calls).toBe(0);
    });
  });

  test("confirms a pair when both directions return contradict with confidence >= 0.6", async () => {
    await withRegistry(async (registry) => {
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("contradict", 0.9, []),
      });
      const out = await findContradictionCandidates(svc, [
        { idea_a_id: "i1", idea_a_text: "ship may 1", idea_b_id: "i2", idea_b_text: "push past may" },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0]?.idea_a_id).toBe("i1");
      expect(out[0]?.idea_b_id).toBe("i2");
    });
  });

  test("rejects a pair when the model returns entail", async () => {
    await withRegistry(async (registry) => {
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("entail", 0.9, []),
      });
      const out = await findContradictionCandidates(svc, [
        { idea_a_id: "i1", idea_a_text: "a", idea_b_id: "i2", idea_b_text: "b" },
      ]);
      expect(out).toHaveLength(0);
    });
  });

  test("rejects a pair when confidence is below 0.6 (margin rule)", async () => {
    await withRegistry(async (registry) => {
      const svc = new InferenceService({
        registry,
        ollama_url: "http://x",
        fetcher: mockOllamaFetch("contradict", 0.55, []),
      });
      const out = await findContradictionCandidates(svc, [
        { idea_a_id: "i1", idea_a_text: "a", idea_b_id: "i2", idea_b_text: "b" },
      ]);
      expect(out).toHaveLength(0);
    });
  });
});
