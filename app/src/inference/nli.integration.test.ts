// T004 (spec-nli-reboot.md R003, R004): live-Ollama regression suite.
//
// Block 1 — iterate __fixtures__/nli-pairs.json, run classifyPair three
// times per pair, assert >= 11/12 correct labels (the stance-aware prompt
// from T002 is allowed one miss on subtle-contradict).
//
// Block 2 — exercise Fixture B's launch-sequence contradict pair
// ("We ship by May 1. Full stop." vs "I think we should push the launch
// past May.") through findContradictionCandidates, asserting both pair
// orderings return label=contradict with confidence >= 0.6 — which under
// the R001 score distribution matches the T008-era calibration rule
// (P(contradict) > 0.6 AND P(contradict) > P(entailment) + 0.2).
//
// Both blocks probe Ollama availability via /api/tags before running and
// skip cleanly when unreachable.

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import fixturePairs from "./__fixtures__/nli-pairs.json" with { type: "json" };
import { DUMPS, EXPECTATIONS } from "./__fixtures__/launch-sequence";
import { InferenceService } from "./inference-service";
import { classifyPair, findContradictionCandidates, type NliLabel } from "./nli";
import { PromptRegistry } from "./prompt-registry";

const OLLAMA_URL = "http://127.0.0.1:11434";
const PAIR_RUNS = 3;
const PER_CALL_TIMEOUT_MS = 30_000;

interface FixturePair {
  id: string;
  premise: string;
  hypothesis: string;
  expected: NliLabel;
}

const FIXTURE_PAIRS: FixturePair[] = fixturePairs as FixturePair[];

async function probeOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function buildService(): Promise<InferenceService> {
  const promptsDir = resolve(import.meta.dir, "..", "..", "..", "prompts");
  const registry = new PromptRegistry({ promptsDir });
  await registry.load();
  return new InferenceService({ registry, ollama_url: OLLAMA_URL });
}

describe("nli integration — fixture-pair regression (R004)", () => {
  test(
    "classifyPair over the 4 fixture pairs, 3 runs each, >= 11/12 correct",
    async () => {
      const available = await probeOllama();
      if (!available) {
        console.warn(
          "[nli.integration] Ollama unreachable at http://127.0.0.1:11434 — skipping. " +
            "Run `bun run test:nli` against a live Ollama to validate.",
        );
        return;
      }
      const svc = await buildService();
      let correct = 0;
      let total = 0;
      const misses: string[] = [];
      for (const pair of FIXTURE_PAIRS) {
        for (let i = 0; i < PAIR_RUNS; i++) {
          total++;
          const scores = await classifyPair(svc, pair.premise, pair.hypothesis);
          // The emitted label is the argmax of the three slots because it
          // carries `confidence` while others carry (1-confidence)/2 <= 0.5.
          const argmax = (["contradiction", "entailment", "neutral"] as const).reduce((a, b) =>
            scores[a] >= scores[b] ? a : b,
          );
          const labelFromScores: NliLabel =
            argmax === "contradiction" ? "contradict" : argmax === "entailment" ? "entail" : "neutral";
          if (labelFromScores === pair.expected) {
            correct++;
          } else {
            misses.push(`${pair.id} run ${i + 1}: got ${labelFromScores}, expected ${pair.expected}`);
          }
        }
      }
      console.log(`[nli.integration] fixture accuracy: ${correct}/${total}`);
      if (misses.length > 0) console.log(`[nli.integration] misses:\n  ${misses.join("\n  ")}`);
      expect(correct).toBeGreaterThanOrEqual(11);
    },
    PER_CALL_TIMEOUT_MS * FIXTURE_PAIRS.length * PAIR_RUNS,
  );
});

describe("nli integration — Fixture B contradict pair (R003)", () => {
  test(
    "findContradictionCandidates detects ship-May-1 vs push-past-May in both orderings",
    async () => {
      const available = await probeOllama();
      if (!available) {
        console.warn(
          "[nli.integration] Ollama unreachable — skipping Fixture B block. " +
            "Run `bun run test:nli` against a live Ollama to validate.",
        );
        return;
      }
      const svc = await buildService();

      // Pull the actual statements from Fixture B's dumps so this test
      // stays in sync with the launch-sequence fixture.
      const lcuasduysDump = DUMPS[0];
      const carolDump = DUMPS[2];
      if (!lcuasduysDump || !carolDump) throw new Error("Fixture B dumps missing");
      // Use the explicit contradict sentences identified by
      // EXPECTATIONS.contradict_pair — these are verbatim substrings of
      // the two dump bodies.
      const premiseA = EXPECTATIONS.contradict_pair[0]; // "We ship by May 1"
      const premiseB = EXPECTATIONS.contradict_pair[1]; // "we should push the launch past May"
      // Expand the premises with one sentence of surrounding dump context
      // so the model has enough text to commit to a stance. We keep the
      // key claim verbatim per the fixture's EXPECTATIONS guarantee.
      const ideaAText = `${premiseA}. Rafal Industries has a May 3 integration dependency and if we slip we lose that contract revenue for Q3.`;
      const ideaBText = `I think ${premiseB}. The demo-video variant I'm building needs two more weeks of iteration before it's shippable.`;

      // Direct call: both orderings should return contradict, confidence >= 0.6.
      const ab = await classifyPair(svc, ideaAText, ideaBText);
      const ba = await classifyPair(svc, ideaBText, ideaAText);
      console.log(
        `[nli.integration] Fixture B AB: contradiction=${ab.contradiction.toFixed(2)} entailment=${ab.entailment.toFixed(2)} neutral=${ab.neutral.toFixed(2)}`,
      );
      console.log(
        `[nli.integration] Fixture B BA: contradiction=${ba.contradiction.toFixed(2)} entailment=${ba.entailment.toFixed(2)} neutral=${ba.neutral.toFixed(2)}`,
      );
      expect(ab.contradiction).toBeGreaterThanOrEqual(0.6);
      expect(ba.contradiction).toBeGreaterThanOrEqual(0.6);

      // And findContradictionCandidates with default thresholds should
      // keep this pair as well.
      const candidates = await findContradictionCandidates(svc, [
        { idea_a_id: "a", idea_a_text: ideaAText, idea_b_id: "b", idea_b_text: ideaBText },
      ]);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.idea_a_id).toBe("a");
      expect(candidates[0]?.idea_b_id).toBe("b");
    },
    PER_CALL_TIMEOUT_MS * 4,
  );
});
