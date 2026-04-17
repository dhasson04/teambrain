// R003: NLI cross-encoder for contradiction detection.
//
// INTENT: Use Xenova/nli-deberta-v3-xsmall via @huggingface/transformers
// to replace the LLM's "spot contradictions" job with a purpose-built
// classifier returning calibrated {contradiction, entailment, neutral}
// probabilities. DeBERTa-v3-small scores 91.7% SNLI / 87.5% MNLI — a
// 4B LLM isn't close on structured inference judgment.
//
// STATUS (2026-04-17, T008 of spec-pipeline-quality.md): the Xenova ONNX
// port + transformers.js v4.1 does not feed the `text_pair` input into
// the model correctly through either the `text-classification` pipeline
// (which returns identical scores for every (text, text_pair) call) or
// `zero-shot-classification` (which returns uniform 1/3 distribution).
// Direct manual tokenization + forward pass would likely work but is
// out-of-scope for this PR.
//
// DEGRADED MODE: the module probes the pipeline on known pairs on first
// use. If the probe detects the text_pair-ignored signature, NLI is
// marked unavailable and findContradictionCandidates returns [].
// Feature flag `features.nli_contradict` stays on; there are just no
// false positives (and correspondingly no true positives) until this is
// fixed.
//
// Follow-up (see research/pipeline-quality-improvement.md §3.C):
//   a. Manual tokenize + model.forward() in transformers.js
//   b. Switch to a different Xenova NLI model that works
//   c. Fall back to an LLM-based binary classifier on pre-filtered
//      cross-cluster pairs with grammar-constrained yes/no output
//      (see spec R001 + features.grammar_constrained_output)

type ClassifyFn = (
  input: { text: string; text_pair: string },
  opts?: { top_k?: number | null },
) => Promise<Array<{ label: string; score: number }> | Array<Array<{ label: string; score: number }>>>;

let classify: ClassifyFn | null = null;
let loading: Promise<void> | null = null;
let activeModel: string | null = null;
let degradedMode = false;
let probed = false;

const MODEL_CANDIDATES = [
  "Xenova/nli-deberta-v3-xsmall",
  "Xenova/nli-deberta-v3-small",
];

export interface NliScores {
  contradiction: number;
  entailment: number;
  neutral: number;
}

async function ensurePipeline(): Promise<void> {
  if (classify) return;
  if (loading) return loading;
  loading = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    let lastError: Error | null = null;
    for (const candidate of MODEL_CANDIDATES) {
      try {
        classify = (await pipeline("text-classification", candidate)) as unknown as ClassifyFn;
        activeModel = candidate;
        return;
      } catch (e) {
        lastError = e as Error;
      }
    }
    throw new Error(
      `NLI pipeline init failed for all candidates ${MODEL_CANDIDATES.join(", ")}: ${lastError?.message}`,
    );
  })();
  await loading;
  loading = null;
}

function parseLabels(raw: unknown): NliScores {
  const arr: Array<{ label: string; score: number }> =
    Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])
      ? (raw[0] as Array<{ label: string; score: number }>)
      : (raw as Array<{ label: string; score: number }>);
  const scores: NliScores = { contradiction: 0, entailment: 0, neutral: 0 };
  for (const entry of arr) {
    const key = entry.label.toLowerCase();
    if (key === "contradiction" || key === "label_0") scores.contradiction = entry.score;
    else if (key === "neutral" || key === "label_1") scores.neutral = entry.score;
    else if (key === "entailment" || key === "label_2") scores.entailment = entry.score;
  }
  return scores;
}

async function rawClassifyPair(premise: string, hypothesis: string): Promise<NliScores> {
  if (!classify) throw new Error("NLI pipeline not initialized");
  const raw = await classify({ text: premise, text_pair: hypothesis }, { top_k: null });
  return parseLabels(raw);
}

async function runProbeIfNeeded(): Promise<void> {
  if (probed) return;
  probed = true;
  try {
    const a = await rawClassifyPair("The sky is blue.", "The sky is red.");
    const b = await rawClassifyPair("All tests pass.", "The test suite is green.");
    const close = (x: number, y: number): boolean => Math.abs(x - y) < 1e-6;
    const identical =
      close(a.contradiction, b.contradiction) &&
      close(a.entailment, b.entailment) &&
      close(a.neutral, b.neutral);
    const uniform =
      close(a.contradiction, 1 / 3) && close(a.entailment, 1 / 3) && close(a.neutral, 1 / 3);
    if (identical || uniform) {
      degradedMode = true;
      console.warn(
        "[nli] degraded mode enabled — pipeline returned " +
          (uniform ? "uniform 1/3 distribution" : "identical scores for distinct inputs") +
          ". Contradiction detection disabled; see nli.ts module header.",
      );
    }
  } catch {
    degradedMode = true;
  }
}

/**
 * Classify a (premise, hypothesis) pair. Returns probabilities for
 * {contradiction, entailment, neutral}. Returns a zeros triple when
 * the pipeline is in degraded mode.
 */
export async function classifyPair(premise: string, hypothesis: string): Promise<NliScores> {
  await ensurePipeline();
  await runProbeIfNeeded();
  if (degradedMode) return { contradiction: 0, entailment: 0, neutral: 0 };
  return rawClassifyPair(premise, hypothesis);
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
 * The both-directions + margin guards keep false positives low.
 * Returns [] when NLI is in degraded mode (see module header).
 */
export async function findContradictionCandidates(
  pairs: Array<{ idea_a_id: string; idea_a_text: string; idea_b_id: string; idea_b_text: string }>,
  opts: { contradictThreshold?: number; margin?: number } = {},
): Promise<ContradictionCandidate[]> {
  if (pairs.length === 0) return [];
  // Trigger probe on first call.
  await classifyPair("probe-a", "probe-b");
  if (degradedMode) return [];

  const contradictThreshold = opts.contradictThreshold ?? 0.6;
  const margin = opts.margin ?? 0.2;
  const results: ContradictionCandidate[] = [];
  for (const pair of pairs) {
    const scores_ab = await rawClassifyPair(pair.idea_a_text, pair.idea_b_text);
    const scores_ba = await rawClassifyPair(pair.idea_b_text, pair.idea_a_text);
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

export function resetNliForTest(): void {
  classify = null;
  loading = null;
  activeModel = null;
  degradedMode = false;
  probed = false;
}

export function isDegradedModeForTest(): boolean {
  return degradedMode;
}

export function getActiveNliModel(): string | null {
  return activeModel;
}
