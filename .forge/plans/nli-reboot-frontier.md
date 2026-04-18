---
spec: nli-reboot
total_tasks: 4
estimated_tokens: 19000
depth: standard
branch: forge/nli-reboot
---

# NLI-Reboot Frontier

4 tasks in 3 tiers. Standard depth. All tasks target the `teambrain` repo. Branch: `forge/nli-reboot`, off `forge/pipeline-quality` tip `0bcd345`. File scope is disjoint from the `citation-fidelity` spec — safe to execute in parallel.

Spec: `.forge/specs/spec-nli-reboot.md`.
Spike artifact: `scripts/spike-nli-gemma3.ts` (proved 75% raw accuracy, 100% stability, 3.6s/pair steady-state latency on 2026-04-18).

## Tier 1 — parallel (no dependencies)

- [T001] Rewrite `classifyPair` to use Ollama + enum-constrained JSON via InferenceService | est: ~7k tokens | repo: teambrain | req: R001
  - **Files**: `app/src/inference/nli.ts` (major rewrite — remove `@huggingface/transformers` import, `MODEL_CANDIDATES`, `degradedMode`, `loading`/`probed` state, `ensurePipeline`, `parseLabels`, all ONNX-specific code). Keep the module's exported API stable (`classifyPair`, `findContradictionCandidates`, `NliScores` interface).
  - **Change**: New `classifyPair(service: InferenceService, premise: string, hypothesis: string): Promise<NliScores>` (service becomes a param rather than a global pipeline). Posts to Ollama via `service.runToString` with `options: { temperature: 0 }`, `format: NLI_SCHEMA` (basic enum label for now — stance fields land in T002), and a system prompt that instructs strict NLI classification. Parses the single-label response and derives `NliScores` as `{ [emittedLabel]: confidence, others: (1 - confidence) / 2 }`.
  - **Acceptance**: `bun test nli` green (existing `nli.test.ts` tests are rewritten to mock InferenceService and assert the request body sent to Ollama contains `format.properties.label.enum` equal to `["contradict","entail","neutral"]`). No `@huggingface/transformers` import remains in `nli.ts`. `pipeline.ts` call sites continue to compile (update signature at call sites to pass the `service` through — one call site in `runPipeline`).
  - **Depends**: none

- [T003] Promote spike pairs to fixture + scripts | est: ~3k tokens | repo: teambrain | req: R004
  - **Files**: New file `app/src/inference/__fixtures__/nli-pairs.json` with the four pair objects from `scripts/spike-nli-gemma3.ts` (blatant-contradict, subtle-contradict, paraphrase-entail, topical-neutral; each with `{id, premise, hypothesis, expected}`). Update `scripts/spike-nli-gemma3.ts` to `import` the fixture JSON rather than hard-code the array. Update `app/package.json` to add `"test:nli": "bun test app/src/inference/nli.integration.test.ts"` and `"test:integration": "bun test --preload ./test-preload.ts 'app/src/inference/*.integration.test.ts'"` (or equivalent — whichever globbing pattern bun supports without breaking default `bun test`).
  - **Change**: Structural only — no logic change. Moving data out of script into fixture so the script and the future integration test stay in sync.
  - **Acceptance**: `bun run scripts/spike-nli-gemma3.ts` still runs and produces the same summary format. `__fixtures__/nli-pairs.json` parses as valid JSON with exactly 4 entries. `bun run test:nli` command exists in package.json (may fail until T004 writes the test — that is fine).
  - **Depends**: none

## Tier 2 — stance-aware prompting refinement

- [T002] Stance-aware schema fields + prompt | est: ~4k tokens | repo: teambrain | req: R002
  - **Files**: `app/src/inference/nli.ts` (extend the `NLI_SCHEMA` from T001).
  - **Change**: Add intermediate fields BEFORE `label` in the schema, in this exact order: `stance_a: { type: "string", minLength: 1 }`, `stance_b: { type: "string", minLength: 1 }`, `topic_shared: { type: "boolean" }`, THEN `label`, THEN `confidence`. Update the system prompt to explicitly: (a) say "first write the position each speaker is taking on any shared topic," (b) state "same topic with opposite positions = contradict, not entail," (c) include one worked example showing a same-topic-opposite-stance pair classified as `contradict`. The model's `stance_a` / `stance_b` outputs are parsed but not exposed in `NliScores` — they only function as structured chain-of-thought forced by schema ordering.
  - **Acceptance**: Unit test in `nli.test.ts` asserts the schema field order is `stance_a, stance_b, topic_shared, label, confidence` (iterate `Object.keys(schema.properties)` and compare). Integration test (see T004) confirms the subtle-contradict pair from the fixture now labels `contradict` in at least 2 of 3 runs.
  - **Depends**: T001 (extends the schema T001 establishes)

## Tier 3 — end-to-end verification

- [T004] Fixture-B contradict detection + regression test suite | est: ~5k tokens | repo: teambrain | req: R003, R004
  - **Files**: New file `app/src/inference/nli.integration.test.ts`. Exercises both the four-pair regression set AND Fixture B's real ideas.
  - **Change**: Test block 1 — load `__fixtures__/nli-pairs.json`, run `classifyPair` 3 times per pair against a live Ollama, assert ≥ 11/12 correct labels (subtle-contradict allowed one miss). Test block 2 — load Fixture B ideas from the vault, feed the known contradict pair ("ship by May 1" / "push launch past May" or whatever the actual idea statements are) into `findContradictionCandidates` + `classifyPair`, assert `contradict` label returned with confidence ≥ 0.6. Both blocks probe Ollama availability and skip with a clear message when unreachable. Calibration: the T008-era rule "P(contradict) > 0.6 AND P(contradict) > P(entailment) + 0.2 in both directions" translates under the new single-label backend to "label === 'contradict' AND confidence >= 0.6 in both pair orderings" — encode that in the assertion.
  - **Acceptance**: `bun run test:nli` passes on `forge/nli-reboot` tip with live Ollama. Fixture B's launch-sequence subproject, when run end-to-end, writes at least one `{kind: "contradict"}` edge to its `connections.json`.
  - **Depends**: T002 (needs stance-aware prompt), T003 (needs fixture file)

## Out of scope

- Path (a) manual transformers.js tokenize + forward (deferred — see spec's Future Considerations).
- Persistent cross-synthesis NLI cache under `.cache/nli-cache.json` (deferred).
- Three-way probability calibration (cheap `(1 - conf) / 2` proxy used for now).

## Dependency summary

```
T001 ──┬── T002 ──┐
       │          ├── T004
T003 ──┴──────────┘
```
