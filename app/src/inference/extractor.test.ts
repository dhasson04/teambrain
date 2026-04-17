import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../vault/init";
import { createProject } from "../vault/projects";
import { createSubproject } from "../vault/subprojects";
import { createDump } from "../vault/dumps";
import { addProfile, makeProfile } from "../vault/profiles";
import { saveLastSynthInput } from "../vault/synthesis";
import { extractAll, extractFromDump } from "./extractor";
import { InferenceService, type InferenceEvent, type RunInput } from "./inference-service";
import { PromptRegistry } from "./prompt-registry";

let dir: string;
let promptDir: string;
let originalVault: string | undefined;

const SYNTH = `---
id: synthesis
version: 0.1.0
model: gemma3:4b
temperature: 0.4
top_p: 0.8
top_k: 40
description: test
includes: []
---
SYNTH BODY
`;
const EXPL = SYNTH.replace(/synthesis/g, "exploration").replace("temperature: 0.4", "temperature: 1.0").replace("top_p: 0.8", "top_p: 0.95").replace("top_k: 40", "top_k: 64");

async function buildRegistry(): Promise<PromptRegistry> {
  promptDir = await mkdtemp(join(tmpdir(), "teambrain-extr-prompts-"));
  await writeFile(`${promptDir}/synthesis.md`, SYNTH);
  await writeFile(`${promptDir}/exploration.md`, EXPL);
  await mkdir(`${promptDir}/_shared`, { recursive: true });
  const reg = new PromptRegistry({ promptsDir: promptDir });
  await reg.load();
  return reg;
}

/**
 * Stub InferenceService that returns canned strings keyed by attempt count.
 */
class FakeService extends InferenceService {
  attempts = 0;
  constructor(
    private readonly responses: string[],
  ) {
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
  dir = await mkdtemp(join(tmpdir(), "teambrain-extr-"));
  originalVault = process.env["TEAMBRAIN_VAULT"];
  process.env["TEAMBRAIN_VAULT"] = dir;
  await initVault();
  await addProfile(makeProfile({ id: "alice", display_name: "Alice" }));
  await createProject("Acme");
  await createSubproject("acme", "Q2");
});

afterEach(async () => {
  if (originalVault === undefined) delete process.env["TEAMBRAIN_VAULT"];
  else process.env["TEAMBRAIN_VAULT"] = originalVault;
  await rm(dir, { recursive: true, force: true });
  if (promptDir) await rm(promptDir, { recursive: true, force: true });
});

const dumpBody = "Step 3 onboarding asks for billing too early. We're losing people right at the credit-card field.";

describe("extractFromDump", () => {
  test("returns ideas whose evidence_quote is a verbatim substring of the dump", async () => {
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          {
            statement: "Billing too early in funnel",
            type: "concern",
            evidence_quote: "Step 3 onboarding asks for billing too early.",
            confidence: 0.8,
          },
        ],
      }),
    ]);
    const out = await extractFromDump({ service: svc, dumpId: "d1", author: "alice", body: dumpBody });
    expect(out).toHaveLength(1);
    expect(out[0]?.statement).toBe("Billing too early in funnel");
    expect(out[0]?.dump_id).toBe("d1");
    expect(out[0]?.author).toBe("alice");
  });

  test("re-prompts when an evidence_quote is not a substring, then drops it after retries", async () => {
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          { statement: "fake quote", type: "claim", evidence_quote: "this is not in the dump", confidence: 0.9 },
        ],
      }),
      JSON.stringify({
        ideas: [
          { statement: "still fake", type: "claim", evidence_quote: "still nope", confidence: 0.9 },
        ],
      }),
      JSON.stringify({
        ideas: [
          { statement: "still fake", type: "claim", evidence_quote: "still nope either", confidence: 0.9 },
        ],
      }),
    ]);
    const out = await extractFromDump({ service: svc, dumpId: "d1", author: "alice", body: dumpBody });
    expect(out).toHaveLength(0);
    expect(svc.attempts).toBe(3); // 1 initial + 2 retries
  });

  test("recovers a partially-bad batch on retry", async () => {
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          { statement: "ok one", type: "concern", evidence_quote: "Step 3 onboarding asks for billing too early.", confidence: 0.8 },
          { statement: "bad one", type: "claim", evidence_quote: "fake quote", confidence: 0.9 },
        ],
      }),
      JSON.stringify({
        ideas: [
          { statement: "ok one", type: "concern", evidence_quote: "Step 3 onboarding asks for billing too early.", confidence: 0.8 },
          { statement: "now ok two", type: "claim", evidence_quote: "credit-card field", confidence: 0.9 },
        ],
      }),
    ]);
    const out = await extractFromDump({ service: svc, dumpId: "d1", author: "alice", body: dumpBody });
    expect(out).toHaveLength(2);
  });

  test("retries on JSON parse failure", async () => {
    const svc = new FakeService([
      "not even json",
      JSON.stringify({
        ideas: [
          { statement: "ok", type: "claim", evidence_quote: "credit-card field", confidence: 0.5 },
        ],
      }),
    ]);
    const out = await extractFromDump({ service: svc, dumpId: "d1", author: "alice", body: dumpBody });
    expect(out).toHaveLength(1);
    expect(svc.attempts).toBe(2);
  });
});

// Regression: backprop-1, BUG-2 — strict byte-exact substring validation drops
// 95%+ of ideas from small models that normalize whitespace/quotes. Enable this
// test when implementing the fuzzy-match fix for extractor validation.
// See spec-synthesis.md R005.
describe.skip("extractFromDump (backprop-1, BUG-2 — fuzzy evidence_quote match)", () => {
  const bodyWithRealSpacing =
    "Step 3 onboarding asks for billing too early.\n  We're losing people\n  right at the credit-card field.";

  test("accepts evidence_quote whose whitespace differs from the dump body", async () => {
    // The model returns a normalized quote (collapsed whitespace) that is NOT
    // a byte-exact substring of the body (which has newlines + double spaces).
    // Before fix: the idea is dropped. After fix: normalized match accepts it.
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          {
            statement: "Billing at step 3 is too early",
            type: "concern",
            evidence_quote: "Step 3 onboarding asks for billing too early. We're losing people right at the credit-card field.",
            confidence: 0.8,
          },
        ],
      }),
    ]);
    const out = await extractFromDump({ service: svc, dumpId: "d1", author: "alice", body: bodyWithRealSpacing });
    expect(out).toHaveLength(1);
    expect(svc.attempts).toBe(1);
  });

  test("accepts evidence_quote with curly quotes when body has straight quotes (or vice versa)", async () => {
    const body = `We said "ship by Friday" but we don't have data.`;
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          {
            statement: "Friday deadline is unsupported",
            type: "concern",
            evidence_quote: `We said \u201Cship by Friday\u201D but we don\u2019t have data.`,
            confidence: 0.7,
          },
        ],
      }),
    ]);
    const out = await extractFromDump({ service: svc, dumpId: "d1", author: "alice", body });
    expect(out).toHaveLength(1);
  });
});

describe("extractAll", () => {
  test("yields cached for unchanged dumps and extracted for new ones", async () => {
    const reg = await buildRegistry();
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          { statement: "x", type: "concern", evidence_quote: "Step 3 onboarding asks for billing too early.", confidence: 0.7 },
        ],
      }),
    ]);
    Object.assign(svc, { registry: reg });

    const d1 = await createDump("acme", "q2", "alice", dumpBody);
    // Mark d1 as already synthesized
    await saveLastSynthInput("acme", "q2", [{ dump_id: d1.id, hash: d1.hash }]);

    // Add a new dump that should trigger extraction
    const d2 = await createDump("acme", "q2", "alice", "Different dump with credit-card field hint.");
    void d2;

    const events: { type: string; dump_id: string }[] = [];
    const gen = extractAll({ service: svc, project: "acme", sub: "q2" });
    let result = await gen.next();
    while (!result.done) {
      events.push({ type: result.value.type, dump_id: result.value.dump_id });
      result = await gen.next();
    }
    const cached = events.filter((e) => e.type === "cached");
    const extracted = events.filter((e) => e.type === "extracted");
    expect(cached).toHaveLength(1);
    expect(extracted).toHaveLength(1);
  });

  test("forceAll re-extracts every dump regardless of cache", async () => {
    const reg = await buildRegistry();
    const svc = new FakeService([
      JSON.stringify({
        ideas: [
          { statement: "x", type: "concern", evidence_quote: "Step 3 onboarding asks for billing too early.", confidence: 0.7 },
        ],
      }),
    ]);
    Object.assign(svc, { registry: reg });

    const d1 = await createDump("acme", "q2", "alice", dumpBody);
    await saveLastSynthInput("acme", "q2", [{ dump_id: d1.id, hash: d1.hash }]);

    const events: { type: string }[] = [];
    const gen = extractAll({ service: svc, project: "acme", sub: "q2", forceAll: true });
    let r = await gen.next();
    while (!r.done) {
      events.push({ type: r.value.type });
      r = await gen.next();
    }
    expect(events.find((e) => e.type === "extracted")).toBeDefined();
    expect(events.find((e) => e.type === "cached")).toBeUndefined();
  });
});
