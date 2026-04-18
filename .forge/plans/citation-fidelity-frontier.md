---
spec: citation-fidelity
total_tasks: 4
estimated_tokens: 18000
depth: standard
branch: forge/citation-fidelity
---

# Citation-Fidelity Frontier

4 tasks in 2 tiers. Standard depth. All tasks target the `teambrain` repo. Branch: `forge/citation-fidelity`, off `forge/pipeline-quality` tip `0bcd345`. File scope is disjoint from the `nli-reboot` spec — safe to execute in parallel.

Spec: `.forge/specs/spec-citation-fidelity.md`.

## Tier 1 — parallel (no dependencies)

- [T001] Refactor `RENDER_FORMAT` into a factory taking `(profiles, dumpIds)` | est: ~6k tokens | repo: teambrain | req: R001, R002
  - **Files**: `app/src/inference/renderer.ts` (turn the `const RENDER_FORMAT` into `function buildRenderFormat(profiles: string[], dumpIds: string[])`), `app/src/inference/renderer.test.ts` (new or extend existing — add unit test asserting the returned schema has `enum` on both `author` and `dump_id` fields in every citation position).
  - **Change**: Construct the schema dynamically so both fields carry the enum. Author enum uses display names (e.g. `["alice","bob","carol"]`). Dump-id enum uses raw dump ids (e.g. `["1cea426c-...T12-54-55-441z", ...]`). All other fields unchanged.
  - **Acceptance**: Unit test passes. No runtime consumer of `RENDER_FORMAT` is broken (TypeScript would catch this — the one consumer is `runToString` which passes the schema as `format`, type shape unchanged).
  - **Depends**: none

- [T003] Remove T015 soft author-warn from validator.ts | est: ~2k tokens | repo: teambrain | req: R003
  - **Files**: `app/src/inference/validator.ts` only.
  - **Change**: Delete the `console.warn("[validator] soft author mismatch...")` branch and its surrounding comment block added in commit `0bcd345`. Preserve the `-iN` suffix-strip block (the `replace(/-i\d+$/, "")` defensive fallback) with a one-line comment pointing at `ollama#15260` as the rationale for keeping it.
  - **Acceptance**: `grep -n "soft author mismatch" app/src/inference/validator.ts` returns no results. Suffix-strip regex still present. `bun test` green (the T013-era regression test stays valid — unrelated to the removed branch).
  - **Depends**: none

## Tier 2 — integration (sequential on Tier 1)

- [T002] Wire `buildRenderFormat` factory into `renderSynthesis` with resolved lists | est: ~5k tokens | repo: teambrain | req: R001, R002
  - **Files**: `app/src/inference/renderer.ts` (the `renderSynthesis` function body).
  - **Change**: Before building the `format` argument for `service.runToString`, resolve `profiles` from the already-loaded `AttributionFile` after `attributionWithDisplayNames` (distinct authors across all citation entries), and resolve `dumpIds` from the `inputs: DumpHashEntry[]` parameter (already scoped to the current subproject). Pass both into `buildRenderFormat` and use the result as `format`.
  - **Acceptance**: Running Re-synthesize on Fixture A produces no `soft author mismatch` warnings in server logs (no longer possible with enum-constraint in place). The on-disk `latest.md` has citation dump-ids that are all exact matches from `listDumps(...)` for that subproject (no `-iN` suffix-strip fallbacks get invoked — check server log for the `[validator] soft` prefix, must be absent).
  - **Depends**: T001

- [T004] Fixture-A materials-citation integration test | est: ~5k tokens | repo: teambrain | req: R004
  - **Files**: New file `app/src/inference/pipeline.integration.test.ts`. Update `app/package.json` — add `"test:integration": "bun test app/src/inference/pipeline.integration.test.ts"` script.
  - **Change**: The test reads all `materials/**/*.md` + `problem.md` for Fixture A and all `dumps/**/*.md` bodies. Computes a small set of distinctive multi-word substrings present only in materials (e.g. "slice cohort data by company size", "leave headroom for May launch"). Runs the full synthesis pipeline against Fixture A (may require a live Ollama at `http://127.0.0.1:11434` — test skips with a clear message if unreachable). Asserts at least one material-only substring appears in the rendered body. Tag the test file header with a comment noting it's an integration test and excluded from default `bun test` timing (default `bun test` glob shouldn't pick it up; only `bun run test:integration` does).
  - **Acceptance**: `bun run test:integration` passes on `forge/citation-fidelity` tip. Test can be skipped when Ollama is down via a quick `fetch("http://127.0.0.1:11434/api/tags")` probe at the top of the test file.
  - **Depends**: T002 (the test relies on the enum-constrained render actually working)

## Out of scope

- Attribution influence scoring (deferred — see spec's Future Considerations).
- CiteGuard-style retrieval re-verification on validator complaints (deferred).
- Pair-constrained `oneOf` schemas linking author to dump (deferred).

## Dependency summary

```
T001 ──── T002 ──── T004
T003
```
