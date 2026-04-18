---
domain: nli-reboot
status: approved
created: 2026-04-18
complexity: medium
linked_repos: [teambrain]
design: DESIGN.md
parent_spec: pipeline-quality
branch: forge/nli-reboot
---

# NLI Reboot Spec

## Overview

T008 shipped `nli.ts` pointing at Xenova's `nli-deberta-v3-xsmall` ONNX port via `@huggingface/transformers` v4.1. The module auto-detects that transformers.js's `text-classification` pipeline fails to thread `text_pair` into the tokenizer correctly (returns identical scores for every pair) and enters degraded mode, returning `[]` for all contradiction candidates. The agent already tried upgrading to `-small` as a fallback (`nli.ts:42-45`); same pipeline-level bug, no improvement.

This spec pivots the backend from transformers.js to Ollama + JSON-schema-constrained binary NLI using the gemma3:4b model already running for extract/merge/render. The spike committed at `scripts/spike-nli-gemma3.ts` on 2026-04-18 proved:
- Blatant contradictions detected at 100% (3/3 runs)
- Paraphrase entailment and topic-neutral both at 100%
- **Subtle contradictions (same topic, opposite stance) classified as `entail`** 3/3 runs — the critical finding
- Latency: avg 3.6s/pair steady state
- Stability: 100% (temperature=0 → deterministic labels)

Fixture B's intended contradict pair ("ship by May 1" vs "push launch past May") falls into the "blatant" bucket and is expected to work with a basic prompt. Subtle cases — which dominate real project discussions — require stance-aware prompting. This spec encodes both.

Research anchors: Ollama structured outputs (ollama.com/blog/structured-outputs, docs.ollama.com/capabilities/structured-outputs); the T008-era follow-up paths documented in `nli.ts:24-29` of which this spec implements option (c).

## Requirements

### R001: Ollama + constrained-JSON classifier replaces transformers.js pipeline
Rewrite `nli.ts` `classifyPair(premise, hypothesis)` to post `/api/chat` to the Ollama backend (already exposed via `InferenceService` in `app/src/inference/inference-service.ts`) with an enum-constrained JSON `format` schema. Remove the `MODEL_CANDIDATES` array, the degraded-mode probe, and the transformers.js `pipeline` import from `nli.ts`. Keep the exported `classifyPair` signature and `findContradictionCandidates` contract stable so `pipeline.ts` doesn't need changes.

**Acceptance Criteria:**
- [ ] `nli.ts` no longer imports from `@huggingface/transformers`. The `degradedMode` state and `MODEL_CANDIDATES` array are gone.
- [ ] `classifyPair(premise, hypothesis)` returns `{ contradiction: number, entailment: number, neutral: number }` where the probabilities are derived deterministically from the constrained-JSON response (the model emits one label + confidence; the module fills the other two slots with `(1 - confidence) / 2`).
- [ ] The JSON schema passed to Ollama includes `label: { type: "string", enum: ["contradict", "entail", "neutral"] }`.
- [ ] Ollama options include `temperature: 0` for determinism (matches spike).
- [ ] Unit test in `nli.test.ts` mocks the InferenceService and asserts the request body sent to Ollama contains `format.properties.label.enum = ["contradict","entail","neutral"]`.

### R002: Stance-aware prompt with intermediate schema fields
The spike proved the bare prompt mislabels same-topic-opposite-stance pairs as `entail`. To fix this, the render schema must force the model to identify each side's stance *before* choosing a label. JSON schema field ordering is preserved by Ollama's constrained decoder, so placing `stance_a` and `stance_b` string fields before `label` forces the model to populate them first, which functions as a structured chain-of-thought.

**Acceptance Criteria:**
- [ ] Schema for the NLI response includes these fields in this exact order: `stance_a` (string, minLength 1), `stance_b` (string, minLength 1), `topic_shared` (boolean), `label` (enum), `confidence` (number 0-1).
- [ ] The system prompt explicitly instructs the model to "first write the position each speaker is taking on any shared topic" and that "same topic with opposite positions = contradict, not entail."
- [ ] Re-running the spike's subtle-contradict pair (premise: "Putting billing at step 3 broke the funnel; we should move it later", hypothesis: "Billing at step 3 is what creates intent. Moving it later would erode conversion") with the new prompt yields `label: contradict` on at least 2 of 3 runs.

### R003: End-to-end contradict edge on Fixture B
The whole point of NLI in this pipeline is to surface contradictions visually as the dashed red edge in the Connections graph. Fixture B (`launch-sequence` subproject) contains a deliberate contradict pair per T003's design. The refactored NLI must detect it and write a `kind: "contradict"` edge to `connections.json`, which the graph then renders.

**Acceptance Criteria:**
- [ ] Running `POST /synthesize` against the Launch Sequence subproject writes a `connections.json` with at least one `{ "kind": "contradict" }` edge whose endpoints are the ideas containing "ship by May 1" and "push launch past May" (or semantic equivalents from the actual LLM output).
- [ ] The existing cross-encoder calibration logic in `pipeline.ts` (confirm contradiction requires `P(contradict) > 0.6 AND P(contradict) > P(entailment) + 0.2 in BOTH directions` per T008's spec R003) is preserved. Under the new single-label backend, this translates to: only count as contradiction when the model emits `label: contradict` with `confidence >= 0.6` in both pair orderings.
- [ ] Integration test that calls `findContradictions` on pre-seeded ideas for Fixture B and asserts the May-ship pair is among returned contradictions.

### R004: Spike pair-set frozen as regression test
Keep `scripts/spike-nli-gemma3.ts` around, but promote its four pair cases into a proper test fixture under `app/src/inference/__fixtures__/nli-pairs.json`. The test runs the new `classifyPair` against each pair and asserts: all three non-subtle pairs are labeled correctly (3/3) and the subtle-contradict pair is labeled correctly on at least 2/3 runs with stance-aware prompting (R002).

**Acceptance Criteria:**
- [ ] `app/src/inference/__fixtures__/nli-pairs.json` exists with the four pairs from `spike-nli-gemma3.ts`.
- [ ] `nli.test.ts` contains a `@integration` test block that iterates pairs, runs 3 classifications each, and asserts 11/12 correct (the subtle case is allowed one miss with stance prompting).
- [ ] `scripts/spike-nli-gemma3.ts` is updated to read the fixture file rather than hard-coding the pairs, so the spike and the integration test never drift apart.
- [ ] Script command `bun test:nli` in `app/package.json` runs the integration block on demand.

## Future Considerations

- **Path (a) fallback — manual transformers.js tokenize + forward**: if the Ollama approach proves too slow at scale (e.g., >100 cross-cluster pairs in a real project), revisit the direct-tokenization approach documented in the current `nli.ts` header. DeBERTa-v3-small at ~20ms/pair beats gemma3:4b at 3.6s/pair by ~180×.
- **Semantic caching across synthesis runs**: today's design caches pair results within a single synthesis. If the same premise/hypothesis pair recurs across multiple syntheses of the same subproject (likely, since ideas persist in `ideas.json`), a persistent cache keyed by `(premise, hypothesis)` hash in `.cache/nli-cache.json` would skip already-labeled pairs entirely.
- **Calibration study**: the `(1 - confidence) / 2` trick in R001 is a cheap proxy for the three-way distribution transformers.js would have given us. If downstream consumers of `NliScores` start caring about non-majority probabilities (e.g., "show me weakly contradictory pairs"), consider asking the model for three confidences directly or running a second call with opposite label bias.
