---
spec: pipeline-quality
total_tasks: 12
estimated_tokens: 85000
depth: standard
branch: forge/pipeline-quality
---

# Pipeline-Quality Frontier

12 tasks in 6 tiers. Standard depth. Each task = one atomic commit. Per-leverage feature flags (per R008) let the legacy path stay in-tree during rollout; the final task removes them.

Research grounding: `research/pipeline-quality-improvement.md`.
Spec: `.forge/specs/spec-pipeline-quality.md`.
Fixture A (existing): `vault/projects/acme-q2-onboarding/subprojects/funnel-investigation/`.
Fixture B (new, T005): `vault/projects/acme-q2-onboarding/subprojects/launch-sequence/`.

## Tier 1 — foundations (parallel)

- [T001] PIPELINE_VERSION constant + cache invalidation (R007) | est: ~5k tokens | repo: teambrain | req: R007
  - **Files**: `app/src/inference/pipeline.ts`, `app/src/vault/synthesis.ts`, `app/src/inference/retrieval.ts` (create stub) — plumb the constant through `saveLastSynthInput`/`readLastSynthInput`; invalidate cache on mismatch.
  - **Change**: Export `PIPELINE_VERSION = 2` from `pipeline.ts`. `saveLastSynthInput` writes `{ version, hashes }` shape; `readLastSynthInput` returns `[]` when version mismatches. Add a raw-array → versioned-object upgrade path for existing on-disk state.
  - **Acceptance**: Regression test in `app/src/vault/synthesis.test.ts` covers both old-format read (empty array returned) AND same-version read (hashes returned). Existing tests still pass.
  - **Depends**: none

- [T002] Grammar-constrained outputs on extract + merge + render (R001) | est: ~10k tokens | repo: teambrain | req: R001
  - **Files**: `app/src/inference/inference-service.ts`, `app/src/inference/extractor.ts`, `app/src/inference/merger.ts`, `app/src/inference/renderer.ts`, `app/src/inference/inference-service.test.ts`
  - **Change**: (a) `RunInput` grows an optional `format?: object` that passes through to Ollama's `/api/chat` body; (b) extractor call passes JSON Schema with `type` as enum over `IdeaTypeSchema`; (c) merger call passes JSON Schema matching `MergeResponseSchema`; (d) renderer call passes a GBNF-style grammar that requires `## Agreed` + `## Disputed` + `## Move forward` in that order, with citation-bearing bullets; (e) shape-error retries removed from the Zod post-validation (semantic retries kept for `evidence_quote` substring check); (f) token-repetition guard: if ≥ 20 consecutive identical tokens detected, abort and error explicitly referencing ollama/ollama#15502.
  - **Acceptance**: 10/10 render runs on Fixture A produce section names verbatim (no `## Concerns` drift). InferenceService test asserts `format` reaches the POST body. `bun test` green.
  - **Depends**: none

- [T003] Create Fixture B — launch-sequence subproject with deliberate contradict pair | est: ~3k tokens | repo: teambrain | req: spec §"Target scenarios"
  - **Files**: `vault/projects/acme-q2-onboarding/subprojects/launch-sequence/_meta.json`, `problem.md`, `materials/*.md` (2 files), `dumps/*.md` (4 files by alice/bob/carol/dan). Write fixture data that (i) contains one obvious agreement cluster of size 3+ across three authors, (ii) contains one obvious contradict pair ("ship by May 1" vs "push launch past May"), (iii) contains one material-only fact the render is expected to cite.
  - **Change**: Vault-only, no code changes. Values designed so R003 and R005 acceptance criteria have unambiguous pass/fail signals.
  - **Acceptance**: Fixture files exist; `POST /api/projects/acme-q2-onboarding/subprojects/launch-sequence/synthesize` runs against current (pre-refactor) pipeline without crashing — confirms vault schema compatibility.
  - **Depends**: none

## Tier 2 — new capability modules (parallel)

- [T004] @huggingface/transformers dep + embeddings.ts module (R002 part 1) | est: ~8k tokens | repo: teambrain | req: R002
  - **Files**: `app/package.json` (add `@huggingface/transformers`), `app/src/inference/embeddings.ts`, `app/src/inference/embeddings.test.ts`
  - **Change**: Export `embed(texts: string[]): Promise<number[][]>` using `Xenova/all-MiniLM-L6-v2` with mean-pool + L2-normalize. Lazy load + cache the pipeline in module scope. On-disk model cache under HF default (`~/.cache/huggingface/`).
  - **Acceptance**: First-call test measures model download trigger (should take > 5s on cold run, < 200 ms on warm). Embedding of identical strings yields byte-identical float arrays. Cosine similarity of obviously-similar sentences > 0.7; orthogonal sentences < 0.3.
  - **Depends**: T001 (for version constant in materials-index metadata)

- [T005] compromise.js dep + hints.ts module + extractor wiring (R004) | est: ~6k tokens | repo: teambrain | req: R004
  - **Files**: `app/package.json` (add `compromise`), `app/src/inference/hints.ts`, `app/src/inference/hints.test.ts`, `app/src/inference/extractor.ts` (wire the `<entities>` block)
  - **Change**: Export `extractHints(body)` returning `{ nouns, people, numbers }`. People resolved against `vault/profiles.json` display_names. Extractor builds the `<entities>` hint block in its prompt. Gated behind `features.hint_block_in_extractor`.
  - **Acceptance**: Extracting from Bob's Fixture A dump yields nouns including "feature flags", "soft path branch", "credit-card form", "A/B test", "small-business cohort"; people includes "Dan"; numbers includes "two days". Hint extraction < 50 ms per 2 KB dump (measured).
  - **Depends**: T002 (extractor is being changed in both — serialize to avoid rebase pain)

## Tier 3 — replacement pipeline stages (parallel)

- [T006] clustering.ts + merger.ts rewrite (R002 part 2) | est: ~9k tokens | repo: teambrain | req: R002
  - **Files**: `app/src/inference/clustering.ts`, `app/src/inference/clustering.test.ts`, `app/src/inference/merger.ts` (rewrite), `app/src/inference/pipeline.ts` (wire new merger + feature flag branch)
  - **Change**: Export `cluster(ideas, threshold)` implementing single-linkage agglomerative over cosine similarity, default threshold 0.72, overridable via `config.cluster_threshold`. Rewritten merger calls `embed()` then `cluster()`, writes cluster_ids + `kind:"agree"` edges. Feature flag `features.embedding_cluster = true` enables new path; legacy LLM merger stays in-tree gated off.
  - **Acceptance**: Fixture A produces ≥ 1 cluster of size ≥ 2 spanning ≥ 2 authors, deterministic across runs. Fixture B's 3-author agreement cluster appears. Clustering test covers: identical strings cluster; orthogonal strings don't; threshold override works; empty input safe.
  - **Depends**: T004 (embeddings), T001 (version bump so old cached ideas.json invalidates)

- [T007] Extract + classify decomposition (R006) | est: ~7k tokens | repo: teambrain | req: R006
  - **Files**: `app/src/inference/extractor.ts` (narrow output schema), `app/src/inference/classify.ts` (new), `app/src/inference/classify.test.ts`, `app/src/inference/pipeline.ts` (wire classify step)
  - **Change**: Extractor schema narrows to `{ ideas: [{ statement, evidence_quote }] }` — no `type`, no `confidence`. `classifyIdea(statement)` calls Ollama with enum-constrained schema and a tight prompt; batched up to 5 ideas/call. `confidence = clamp(evidence_quote.length / statement.length, 0.3, 1.0)`. Feature flag `features.pipeline_decomp`.
  - **Acceptance**: 90%+ type-classification accuracy against hand-labeled ground truth on Fixtures A + B. Classification test covers all 6 enum values + batch path + enum constraint rejection.
  - **Depends**: T002 (uses new grammar-constrained calling pattern), T005 (extractor changes serialize)

## Tier 4 — cross-dump intelligence (parallel)

- [T008] NLI cross-encoder for contradictions (R003) | est: ~8k tokens | repo: teambrain | req: R003
  - **Files**: `app/src/inference/nli.ts`, `app/src/inference/nli.test.ts`, `app/src/inference/pipeline.ts` (wire after clustering)
  - **Change**: Export `classifyPair(premise, hypothesis)` using `Xenova/nli-deberta-v3-xsmall` (fallback `-small` if xsmall unavailable on Xenova; verify during implementation). `findContradictions(ideas, clusters)` iterates cross-author pairs in different clusters, calls NLI both directions, confirms when `P(contradict) > 0.6` AND `P(contradict) > P(entailment) + 0.2` in BOTH directions. Confirmed pairs get one LLM call for the `reason` field. Writes `kind:"contradict"` edges to connections.json. Feature flag `features.nli_contradict`.
  - **Acceptance**: Fixture A flags the lcuasduys/carol billing contradiction. Fixture B flags the May-ship contradict pair. Fixture B's non-contradict cross-author pairs are NOT flagged. NLI test covers: contradict labeled; entailment not; neutral not; margin guard rejects; both-directions requirement rejects one-way.
  - **Depends**: T004 (same transformers.js runtime), T006 (needs cluster assignments)

- [T009] Contextual retrieval wires materials + problem.md into render (R005) | est: ~9k tokens | repo: teambrain | req: R005
  - **Files**: `app/src/inference/retrieval.ts` (flesh out the T001 stub), `app/src/inference/retrieval.test.ts`, `app/src/inference/renderer.ts` (prepend `<project-context>` block), `app/src/inference/pipeline.ts`
  - **Change**: `indexMaterials(project, sub)` reads problem.md + materials/*.md, chunks (1 chunk/file for v1; paragraph-split if > 600 tokens), embeds, persists `.cache/materials-index.json` with `{ version, model_name, chunks }`. Mtime-based incremental rebuild. `retrieveForRender(project, sub, ideas)` embeds concatenated ideas as query, returns top-3 chunks. Renderer prompt grows `<project-context>` block. Feature flag `features.retrieval_at_render`.
  - **Acceptance**: Fixture A render output references a material-only fact from kickoff-meeting-2026-02-19.md (e.g. "Dan to slice cohort data by company size"). Fixture B render output references the material-only fact designed into T003. Toggling the flag off reverts to no-context render — verified by diffing output strings.
  - **Depends**: T004 (embeddings), T001 (version constant in index metadata)

## Tier 5 — integration

- [T010] Complete `features.*` config surface + README (R008 part 1) | est: ~4k tokens | repo: teambrain | req: R008
  - **Files**: `app/src/server/config.ts` (grow AppConfig with features block + cluster_threshold), `app/src/server/config.test.ts`, `config.json` (repo-root defaults), `README.md` (flag matrix documentation)
  - **Change**: All flags now plumbed through `loadConfig().features.*`. With all flags `false`, pipeline is byte-identical to pre-R001 behavior. With all flags `true`, pipeline is the new spec. README documents every flag + default.
  - **Acceptance**: Config test covers every flag's default + override. Regression: run Fixture A with all flags off, assert output matches pre-refactor baseline. Run with all flags on, assert output matches new-spec expectations.
  - **Depends**: T006, T007, T008, T009 (each leverage flag must exist to be documented)

- [T011] End-to-end Playwright verification | est: ~5k tokens | repo: teambrain | req: spec §"Validation"
  - **Files**: new test file `app/web/e2e/pipeline-quality.spec.ts` or similar (whichever pattern the existing Playwright harness uses)
  - **Change**: Restart dev server, click Re-synthesize on Fixture A, wait for completion, assert: (a) Synthesis tab shows `## Agreed`, `## Disputed`, `## Move forward` — exact strings; (b) Connections graph renders ≥ 1 solid-green edge; (c) Connections graph renders ≥ 1 dashed-red edge; (d) clicking a node in the graph opens a side panel with verbatim quotes. Same run against Fixture B.
  - **Acceptance**: Playwright run passes on both fixtures. Screenshots saved to `.playwright-mcp/` for the commit.
  - **Depends**: T010

## Tier 6 — cleanup

- [T012] Remove legacy paths + hard-code flag defaults (R008 part 2) | est: ~5k tokens | repo: teambrain | req: R008
  - **Files**: every file that still has a `features.X` check; remove both the check and the old code path; simplify `AppConfig`; update `config.json` to remove the features block
  - **Change**: Only after T011 is green. Removes the legacy LLM `mergeIdeas()` function, the legacy extractor schema code path, the flag-driven branches in pipeline.ts. README stops documenting flags and documents final behavior.
  - **Acceptance**: No reference to `features.` in `app/src/` after this lands. Full test suite green. `bun run build` succeeds on both the frontend and the presentation decks.
  - **Depends**: T011 (proven behavior before removing rollback capability)

## Out of scope

- Wiki-mode (Path 2 from research doc) — separate spec.
- Gemma 4 migration — upstream regression.
- UI changes to the Synthesis or Connections tabs — none needed; they consume the new JSON without change.
- Exploration persona — not implicated.

## Dependency summary

```
T001──┐
      ├── T004 ── T006 ──┬── T008
T002──┼── T005 ── T007 ──┤
      │                   ├── T009 (needs T004)
T003──┘                   │
                          └── T010 ── T011 ── T012
```
