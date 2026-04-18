// R001 (spec-nli-reboot): NLI via Ollama + enum-constrained JSON.
//
// The transformers.js path (T008 of spec-pipeline-quality.md) was abandoned
// because the Xenova ONNX ports of nli-deberta-v3 return identical scores for
// every (text, text_pair) call through the `text-classification` pipeline and
// uniform 1/3 under zero-shot. The follow-up paths in the old module header
// were (a) manual tokenize+forward, (b) a different Xenova model, or
// (c) LLM-based classifier with grammar-constrained output. The spike at
// scripts/spike-nli-gemma3.ts (2026-04-18) proved option (c) works on
// gemma3:4b already loaded for extract/merge/render: 9/12 raw accuracy,
// 100% stability at temperature=0, ~3.6s/pair steady-state.
//
// This module delegates the single LLM call to InferenceService.runToString
// with an enum-constrained JSON `format` field. The model emits one label
// plus a confidence, and we synthesize the three-way {contradiction,
// entailment, neutral} distribution required by downstream calibration by
// assigning `(1 - confidence) / 2` to the two non-emitted slots. This is a
// cheap proxy for the true softmax distribution a cross-encoder would give,
// but it preserves the calibration rule (P > 0.6 AND P > others + 0.2 in
// both directions) under the new backend.
//
// Stance-aware schema fields (stance_a, stance_b, topic_shared) land in T002
// ahead of the `label` field to function as structured chain-of-thought —
// Ollama's constrained decoder honors schema property order, so forcing the
// model to write each speaker's position before picking a label fixes the
// subtle-contradict miss the spike identified.

import type { InferenceService } from "./inference-service";

export interface NliScores {
  contradiction: number;
  entailment: number;
  neutral: number;
}

export type NliLabel = "contradict" | "entail" | "neutral";

/**
 * JSON schema passed to Ollama's `format` field. Field order matters —
 * Ollama's constrained decoder populates the object in declared order, so
 * later fields see earlier fields' contents as context. T002 prepends
 * stance fields to force structured chain-of-thought.
 */
export const NLI_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", enum: ["contradict", "entail", "neutral"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["label", "confidence"],
  additionalProperties: false,
} as const;

/**
 * System prompt for the NLI persona. Kept terse — the schema does most of
 * the steering. T002 extends this with stance-aware guidance.
 */
export const NLI_SYSTEM_PROMPT = `You are a strict Natural Language Inference classifier. Given a PREMISE and a HYPOTHESIS, decide whether the HYPOTHESIS:
- contradict: directly disagrees with or negates the PREMISE
- entail: re-states, paraphrases, or logically follows from the PREMISE
- neutral: talks about a different topic, or the relationship is unclear

Return JSON only. No prose outside the JSON.`;

interface NliRawResponse {
  label: NliLabel;
  confidence: number;
}

function distributeScores(label: NliLabel, confidence: number): NliScores {
  const other = Math.max(0, (1 - confidence) / 2);
  const scores: NliScores = { contradiction: 0, entailment: 0, neutral: 0 };
  scores.contradiction = label === "contradict" ? confidence : other;
  scores.entailment = label === "entail" ? confidence : other;
  scores.neutral = label === "neutral" ? confidence : other;
  return scores;
}

/**
 * Classify a (premise, hypothesis) pair via Ollama. The caller supplies an
 * InferenceService so this module doesn't own any global state (matches the
 * pattern used by extractor / merger / renderer).
 *
 * Returns {contradiction, entailment, neutral} probabilities with the
 * emitted label holding the model's confidence and the remaining two slots
 * holding `(1 - confidence) / 2` each.
 */
export async function classifyPair(
  service: InferenceService,
  premise: string,
  hypothesis: string,
): Promise<NliScores> {
  const userContent = `${NLI_SYSTEM_PROMPT}\n\n---\n\nPREMISE:\n${premise}\n\nHYPOTHESIS:\n${hypothesis}\n\nClassify the relationship.`;
  const raw = await service.runToString({
    persona_id: "synthesis",
    messages: [{ role: "user", content: userContent }],
    override: { temperature: 0 },
    format: NLI_SCHEMA,
  });
  let parsed: NliRawResponse;
  try {
    parsed = JSON.parse(raw) as NliRawResponse;
  } catch (e) {
    throw new Error(`NLI response was not valid JSON: ${(e as Error).message}. Raw: ${raw.slice(0, 200)}`);
  }
  if (parsed.label !== "contradict" && parsed.label !== "entail" && parsed.label !== "neutral") {
    throw new Error(`NLI response label out of enum: ${JSON.stringify(parsed)}`);
  }
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
  const clamped = Math.max(0, Math.min(1, confidence));
  return distributeScores(parsed.label, clamped);
}

export interface ContradictionCandidate {
  idea_a_id: string;
  idea_b_id: string;
  scores_ab: NliScores;
  scores_ba: NliScores;
}

/**
 * Given pairs to evaluate, call NLI in both directions for each pair.
 * A pair is confirmed contradictory when BOTH directions give:
 *   P(contradict) > contradictThreshold  (default 0.6)
 *   AND P(contradict) > P(entailment) + margin  (default 0.2)
 *
 * Under the new single-label backend, these thresholds translate to:
 *   emitted label === "contradict" with confidence >= 0.6 in both orderings,
 * since the non-emitted slots carry at most (1 - 0.6) / 2 = 0.2 and cannot
 * exceed the emitted confidence.
 */
export async function findContradictionCandidates(
  service: InferenceService,
  pairs: Array<{ idea_a_id: string; idea_a_text: string; idea_b_id: string; idea_b_text: string }>,
  opts: { contradictThreshold?: number; margin?: number } = {},
): Promise<ContradictionCandidate[]> {
  if (pairs.length === 0) return [];
  const contradictThreshold = opts.contradictThreshold ?? 0.6;
  const margin = opts.margin ?? 0.2;
  const results: ContradictionCandidate[] = [];
  for (const pair of pairs) {
    const scores_ab = await classifyPair(service, pair.idea_a_text, pair.idea_b_text);
    const scores_ba = await classifyPair(service, pair.idea_b_text, pair.idea_a_text);
    const forward =
      scores_ab.contradiction > contradictThreshold &&
      scores_ab.contradiction > scores_ab.entailment + margin;
    const reverse =
      scores_ba.contradiction > contradictThreshold &&
      scores_ba.contradiction > scores_ba.entailment + margin;
    if (forward && reverse) {
      results.push({
        idea_a_id: pair.idea_a_id,
        idea_b_id: pair.idea_b_id,
        scores_ab,
        scores_ba,
      });
    }
  }
  return results;
}
