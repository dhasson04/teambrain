---
domain: pipeline-quality
status: approved
created: 2026-04-17
complexity: medium-large
linked_repos: [teambrain]
design: DESIGN.md
research_ref: research/pipeline-quality-improvement.md
branch: forge/pipeline-quality
---

# Pipeline Quality Spec

## Overview

Close the quality gap surfaced by the 2026-04-17 smoke test (documented in `presentation-deep-dive/` and the five `spec-synthesis` backprop fixes) by pushing the 4B local model out of structural decisions and into the one place it's irreplaceable: rendering.

Replaces three LLM responsibilities with deterministic or specialized components:

- **Extraction & rendering shape** → grammar-constrained outputs (the model cannot emit invalid structure by construction)
- **Cross-dump clustering** → sentence-transformer embeddings + agglomerative clustering (deterministic, same inputs → same clusters)
- **Cross-dump contradictions** → NLI cross-encoder classifier (DeBERTa-v3-small, trained specifically for this)

Adds two net-new pipeline stages:

- **Noun-phrase hints** — deterministic entity pre-extraction that seeds the extractor's attention
- **Contextual retrieval** — wires `materials/*.md` and `problem.md` into the render call (closing the "Big Lie" from deep-dive slide 11)

Research grounding, six-leverage rationale, and every citation live in `research/pipeline-quality-improvement.md`. This spec is the Forge-executable slice of Path 1 from that doc. Wiki-mode (Path 2) is explicitly out of scope — re-brainstorm after this ships if we want to go there.

## Hard rules

1. Every new dependency is one-time-installable via `bun install` — no Python sidecar, no system-level runtimes beyond Ollama.
2. Every leverage ships behind a config flag (`features.<leverage_name>`) with default that matches the new behavior; old code paths stay in-tree during the first PR and are removed in a dedicated cleanup PR once the new paths are proven.
3. No change breaks deterministic reproduction: given the same dumps + materials + model + config, re-running synthesis produces byte-identical output.
4. Every R-number ships with: (a) implementation, (b) regression test scaffolded in `bun:test`, (c) a concrete `vault/` fixture that exercises the behavior, (d) an entry in `.forge/history/backprop-log.md` if the change closes a known bug.

## Target scenarios

These fixtures anchor acceptance across the spec. "Before" is the observed 2026-04-17 state; "after" is the quality bar we're signing up for.

- **Fixture A (already in vault):** `acme-q2-onboarding/funnel-investigation`, 3 dumps (Alice/Bob/Carol), 1 kickoff meeting material, 1 problem statement.
- **Fixture B (to be added):** `acme-q2-onboarding/launch-sequence`, 4 dumps with at least one pair of verbatim-contradictory claims ("ship by May" vs "ship after May"), 2 materials, richer problem statement.

Quality bar on Fixture A end-to-end:
- **≥ 1 cluster of size ≥ 2** where today there are zero.
- **≥ 1 contradict-typed edge** flagging the billing-placement disagreement between lcuasduys and carol.
- **Synthesis renders `## Agreed`, `## Disputed`, `## Move forward`** — all three section names verbatim (today the renderer drifts to `## Concerns`).
- **Renderer cites at least one piece of material-derived context** — e.g. references the May launch window or the Friday decision deadline that today only exists in `materials/kickoff-meeting-2026-02-19.md`.

## Requirements

### R001: Grammar-constrained outputs on every LLM call
Every call to Ollama through `InferenceService` can carry a `format` parameter that constrains output structure via llama.cpp's GBNF backend. The extractor, merger, and renderer each pass their own schema. The model cannot emit structure violations.

**Acceptance Criteria:**
- [ ] `InferenceService.runToString` / `.run` accept an optional `format?: object` argument that passes straight through to Ollama's `/api/chat` request body as the `format` field
- [ ] Extractor call passes a JSON Schema for `{ ideas: [{ statement, type: enum, evidence_quote, confidence }] }` with `type` constrained to the existing six-value enum from `IdeaTypeSchema`; `additionalProperties: false` at every level
- [ ] Merger call passes a JSON Schema matching `MergeResponseSchema` (clusters, contradictions, edges)
- [ ] Renderer call passes a GBNF or structured-markdown schema that requires exactly three `## ` section headers with the names `Agreed`, `Disputed`, `Move forward` in that order, each followed by ≥ 0 `- ` bullets each ending with at least one `[Author, dump-id]` citation
- [ ] After the fix, re-running Fixture A's render stage on gemma3:4b produces `## Disputed` and `## Move forward` section headers (not `## Concerns`) on 10/10 attempts across 3 runs with different seeds
- [ ] Retry loop shrinks: the Zod post-validation in extractor/merger retries only for semantic errors (`evidence_quote` substring check, idea_id cross-reference) and NOT for shape errors — because shape errors can no longer occur
- [ ] Bug bail-out: if Ollama returns a token-repetition-loop signature (≥ 20 consecutive identical tokens), the service aborts the call and surfaces a specific error; reference [ollama/ollama#15502](https://github.com/ollama/ollama/issues/15502) in the code comment
- [ ] Regression test in `app/src/inference/inference-service.test.ts` asserts that `runToString` with a `format` argument includes `format` in the POST body to Ollama

### R002: Embedding-based clustering replaces the LLM merge pass
The existing `mergeIdeas()` LLM call is replaced with a deterministic pipeline: embed each idea → agglomerative cluster → assign cluster_id. Contradictions are no longer produced here (moved to R003).

**Acceptance Criteria:**
- [ ] New dep `@huggingface/transformers` added to `app/package.json`
- [ ] New module `app/src/inference/embeddings.ts` exports `embed(texts: string[]): Promise<number[][]>` using `Xenova/all-MiniLM-L6-v2` with mean pooling + L2 normalization
- [ ] First call lazy-loads the model and caches under `~/.cache/teambrain/models/` (or Hugging Face's default) — subsequent calls reuse the in-memory pipeline
- [ ] New module `app/src/inference/clustering.ts` exports `cluster(ideas: AttributedIdea[], threshold?: number): ClusterAssignment[]` implementing single-linkage agglomerative clustering over cosine similarity; default threshold `0.72`; threshold overridable via `config.cluster_threshold`
- [ ] `merger.ts` is rewritten: no more LLM call; instead calls `embed()` then `cluster()`, writes cluster_ids back onto ideas, persists `ideas.json` + `connections.json` with `kind: "agree"` edges between cluster members
- [ ] Given Fixture A (6 ideas, lcuasduys + bob + carol), clustering produces ≥ 1 cluster of size ≥ 2 containing at least 2 different authors — deterministic across runs
- [ ] Given Fixture B (designed to have one obvious 3-author agreement cluster), that cluster is produced
- [ ] Regression tests in `app/src/inference/clustering.test.ts` cover: identical statements cluster; orthogonal statements don't; threshold override works; empty input returns empty output
- [ ] The old LLM-based `mergeIdeas` is gated behind `features.legacy_llm_merge = false` in `config.json`; keeping it in-tree for v1 so comparisons are possible; removed in cleanup PR (R008)

### R003: NLI cross-encoder for contradiction detection
After clustering, every pair of cross-author ideas in different clusters is run through a pretrained NLI model. Confirmed contradictions become `kind: "contradict"` edges.

**Acceptance Criteria:**
- [ ] New module `app/src/inference/nli.ts` exports `classifyPair(premise: string, hypothesis: string): Promise<{ contradiction: number; entailment: number; neutral: number }>`
- [ ] Uses `Xenova/nli-deberta-v3-xsmall` (or `-small` if xsmall isn't available on the Xenova org — verify during implementation) via `@huggingface/transformers`
- [ ] Lazy-loaded same pattern as embeddings; model cached on disk; probability scores returned directly
- [ ] New orchestrator function `findContradictions(ideas, clusters)`:
  - For every pair (I, J) where `I.author !== J.author` AND `I.cluster_id !== J.cluster_id`, call `classifyPair(I.statement, J.statement)` and the symmetric `(J.statement, I.statement)`
  - A pair is confirmed when BOTH directions give `P(contradiction) > 0.6` AND `P(contradiction) > P(entailment) + 0.2`
  - Confirmed pairs get a single LLM call asking "In one sentence, why do these two claims contradict?" to populate `reason`
- [ ] Given Fixture A, the lcuasduys "billing at step 3" vs carol "defer billing risks freemium" pair is flagged contradictory
- [ ] Given Fixture B's deliberate contradict pair ("ship by May" / "ship after May"), the pair is flagged contradictory
- [ ] Given Fixture B's NON-contradict cross-author pair (two proposals about different topics), the pair is NOT flagged contradictory — i.e., zero false positives on the fixture set
- [ ] Regression tests in `app/src/inference/nli.test.ts` cover: contradiction gets flagged; entailment doesn't; neutral doesn't; the margin guard rejects low-confidence pairs; symmetric-direction requirement rejects one-way predictions

### R004: Noun-phrase hints seed the extractor
Before sending a dump to the extractor, pre-extract noun phrases + named-entity candidates deterministically and include them in the prompt as an `<entities>` hint block.

**Acceptance Criteria:**
- [ ] New dep `compromise` (pure-JS NLP, ~2 MB) added to `app/package.json`
- [ ] New module `app/src/inference/hints.ts` exports `extractHints(dumpBody: string): { nouns: string[]; people: string[]; numbers: string[] }`
  - `nouns`: deduplicated noun phrases, length ≥ 4 chars, not in a stopword list
  - `people`: people referenced by first name, cross-referenced against `vault/profiles.json` display_names (so "Alice" resolves to profile id if there's a profile named Alice)
  - `numbers`: numeric references including unit/context ("step 3", "38%", "two days")
- [ ] Extractor builds its prompt with hints appended:
  ```
  <dump author="..." id="...">{body}</dump>
  <entities>
  - noun phrases: [...]
  - people mentioned: [...]
  - numbers: [...]
  </entities>
  ```
- [ ] Given Fixture A's Bob dump (the one that yielded 0 ideas in the strict-match run and 4 ideas after backprop-1), extraction now yields ≥ 4 ideas with the hints block AND the fuzzy matcher — i.e. this additive on top of backprop-1, not a replacement
- [ ] Regression test in `app/src/inference/hints.test.ts` covers: extracting noun phrases from the Bob fixture; deduplication; stopword filtering; people resolution against a test profiles.json fixture
- [ ] Hint extraction completes in < 50 ms per 2KB dump on CPU (measured in the test)

### R005: Contextual retrieval wires materials + problem.md into the render call
`materials/*.md` and `problem.md` are indexed via embeddings; at render time the top-3 relevant chunks are retrieved and prepended to the render prompt as a `<project-context>` block.

**Acceptance Criteria:**
- [ ] New module `app/src/inference/retrieval.ts` exports two functions:
  - `indexMaterials(project, sub): Promise<void>` — reads `problem.md` + every file in `materials/`, chunks each to ~300 tokens (treat each material file as one chunk for v1; chunk by paragraph if > 600 tokens), embeds via R002's `embed()`, persists to `.cache/materials-index.json` with `{ model_name, chunks: [{ id, source, text, embedding }] }`
  - `retrieveForRender(project, sub, ideas): Promise<RetrievedChunk[]>` — embeds a query derived from concatenated idea.statement, cosine-searches the index, returns top-3 chunks
- [ ] Index is incrementally rebuilt: on file-mtime mismatch OR model_name mismatch in the persisted index, re-embed the affected chunks only; not the whole index
- [ ] Renderer's prompt now includes:
  ```
  <project-context>
  problem: {top-1 from problem.md OR full problem.md if < 300 tok}
  {for each retrieved material chunk}
  relevant-material ({filename}): {text}
  </project-context>
  ```
- [ ] Given Fixture A, the render output cites at least one fact that only exists in `materials/kickoff-meeting-2026-02-19.md` — e.g. "Dan to slice cohort data by company size" or "small-business cohort: 2x harder than enterprise" — proving material influence
- [ ] Index is NOT touched by the extractor or merger — extract remains dump-local so per-teammate author attribution stays clean; context only influences the final render
- [ ] Regression test asserts that on Fixture A with materials removed vs materials present, the render output differs in a measurable way (e.g. reference to a material-only term appears / disappears)

### R006: Pipeline decomposition — extract + classify as separate calls
The current single extractor call does four things (decide-idea, assign-type, quote-verbatim, score-confidence). Split into a narrow extract call (JSON-constrained to `{ statement, evidence_quote }` only) and a separate classify call per idea (enum-constrained to one of the six types). Confidence becomes deterministic.

**Acceptance Criteria:**
- [ ] Extractor call's schema is narrowed: output is `[{ statement, evidence_quote }]` only — no `type`, no `confidence`
- [ ] New function `classifyIdea(statement): Promise<IdeaType>` calls Ollama with a tight prompt ("Given this statement, output exactly one word from: theme|claim|proposal|concern|question|deliverable") and an enum-constrained JSON schema
- [ ] Classification is batched: up to 5 ideas per LLM call where reasonable; still enum-constrained
- [ ] `confidence` is derived deterministically as `min(1, evidence_quote.length / statement.length)` clamped to [0.3, 1.0] — replaces the LLM-assigned confidence entirely
- [ ] Given Fixture A and B, classification correctness is ≥ 90% against a hand-labeled ground truth (fixture authors tag each idea with its expected type; regression test compares)
- [ ] Regression test in `app/src/inference/classify.test.ts` covers: all 6 enum values parseable; batch path; constrained schema rejects non-enum output

### R007: `PIPELINE_VERSION` and cache invalidation
Introduce a monotonic pipeline version constant. Stored alongside `last-synth-input.json` and the materials index. Any mismatch triggers full re-extraction + re-indexing.

**Acceptance Criteria:**
- [ ] Constant `PIPELINE_VERSION = 2` exported from `app/src/inference/pipeline.ts` (current stateless pipeline is v1, new pipeline is v2)
- [ ] `saveLastSynthInput` writes `{ version: PIPELINE_VERSION, hashes: [...] }` (bump from raw array)
- [ ] `readLastSynthInput` returns `[]` (forcing full re-extraction) when stored version < current
- [ ] `indexMaterials` writes `model_name` AND `version` into the index; mismatch on either triggers full re-embed
- [ ] Backward compat: if the on-disk format is the old raw-array shape (no `version` field), treat as v1 → invalidate
- [ ] Regression test in `app/src/vault/synthesis.test.ts` covers both the old-format upgrade path and the version-bump invalidation path

### R008: Config surface + feature flags
All new leverages are toggleable via `config.json` so old code paths can be compared side-by-side during rollout. Old paths are removed in a dedicated cleanup PR after all leverages have proven their regression tests green for one merge cycle.

**Acceptance Criteria:**
- [ ] `config.json` grows a `features` block with defaults:
  ```json
  {
    "features": {
      "grammar_constrained_output": true,
      "embedding_cluster": true,
      "nli_contradict": true,
      "hint_block_in_extractor": true,
      "retrieval_at_render": true,
      "pipeline_decomp": true
    },
    "cluster_threshold": 0.72,
    "extract_max_retries": 2
  }
  ```
- [ ] Every flag reads through `loadConfig()` — no direct `process.env` inside the inference modules
- [ ] With ALL flags off, the pipeline behaves byte-identical to the pre-R001..R006 behavior (modulo the backprop-1..5 fixes which are not flagged)
- [ ] With ALL flags on, the pipeline behaves per the new spec
- [ ] A dedicated cleanup PR (landed after all six leverages green for one cycle) removes the legacy code paths and the flags; flags default becomes hard-coded
- [ ] README documents the flag matrix

## Out of scope

- **Wiki-mode (Path 2 from the research doc).** Re-brainstorm after this ships.
- **Gemma 3 → Gemma 4 migration.** Gemma 4 has the grammar-constraint repetition-collapse regression; stay on Gemma 3.
- **Model upgrade to gemma3:12b.** Doesn't fit in 6 GB VRAM; parked.
- **Cloud API fallback.** Contradicts local-first positioning.
- **UI changes.** This is a backend-only spec. The Connections tab + Synthesis tab consume the new JSON without change.
- **Exploration persona ("New Direction" chat).** Not implicated in smoke-test findings.

## Validation — how we measure "it worked"

Three levels, per research doc §6:

1. **Unit regressions** — every R ships tests; full suite stays green.
2. **Fixture replays** — re-run synthesis against Fixtures A and B after each R lands. Expected metrics delta baked into the acceptance criteria above.
3. **End-to-end Playwright verification** — one run after R008 lands: click Re-synthesize in the app, confirm the Synthesis tab shows `## Agreed / ## Disputed / ## Move forward` (not `## Concerns`), confirm Connections graph shows ≥ 1 solid-green edge AND ≥ 1 dashed-red edge.

## Risks

- **Transformers.js cold-download is 150-400 MB.** First-synthesis UX is bad. Mitigation: log clearly during install ("downloading embedding model, one-time, ~150 MB"); document in README; optionally prefetch on `bun install` via a postinstall script.
- **Agglomerative clustering threshold is domain-dependent.** 0.72 is a reasonable default from the BERTopic literature but may over-/under-cluster for team-specific language. Mitigation: R008 exposes the threshold in `config.json`.
- **NLI false positives on abstract language.** DeBERTa was trained on MultiNLI (general English). Team-specific jargon may confuse it. Mitigation: the margin guard (P(contradiction) > P(entailment) + 0.2) plus the both-directions-required rule should bound this; we watch the signal on Fixture B.
- **Gemma 3 grammar-constrained generation still has edge cases even without the Gemma 4 regression.** Mitigation: the token-repetition guard in R001 + the existing validator retries give us belt-and-suspenders.

## References

Lives at `research/pipeline-quality-improvement.md`. The six-leverage rationale, the Karpathy wiki reframe (out of scope here but referenced for context), and every external source are there.
