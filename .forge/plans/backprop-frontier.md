---
spec: backprop-2026-04-17
total_tasks: 5
estimated_tokens: 32000
depth: standard
source_backprops: [.forge/history/backprop-log.md #1..5]
bug_brief: .forge/bug-report-smoke-test.md
---

# Backprop Frontier — 2026-04-17

Targeted fix batch for the 4 open bugs from the post-ship smoke test. Each
task: implement per `bug-report-smoke-test.md`, remove `.skip` from the
corresponding regression tests, run `bun test` (all green incl. the newly
enabled tests), commit atomically with message `fix(backprop-N): ...`.

BUG-1 (R009 idleTimeout) is already fixed in commit `dee4af3` with a
passing non-skipped regression test — no task here.

## Tier 1 (parallel — both target BUG-3, independent change surfaces)

- [T001] Renderer: expose `display_name` not profile UUID in attribution context | est: ~6k tokens | repo: teambrain | req: R007 | design: DESIGN.md
  - **File**: `app/src/inference/renderer.ts` (plus any ideas/attribution loader)
  - **Change**: In the `compact` JSON handed to the LLM (currently `renderer.ts:52-60`), replace each `attribution[*].author` UUID with the profile's `display_name` resolved from `vault/profiles.json`. Keep the raw UUID only for server-side lookup; it must not appear in the LLM prompt.
  - **Acceptance**: The renderer prompt body contains no profile UUIDs. Existing passing tests still pass. Backprop #2 regression tests (`validator.test.ts` `describe.skip "validateCitations (backprop-2, BUG-3 — dump-id prefix tolerance)"`) — specifically the third test "accepts citation when author is the display_name 'Alice'" — is un-skipped and passes.
  - **Depends**: none

- [T002] Validator: dump-id prefix tolerance + ambiguous-prefix complaint | est: ~6k tokens | repo: teambrain | req: R008
  - **File**: `app/src/inference/validator.ts`
  - **Change**: In `validateCitations`, before emitting "does not exist", check if the cited `dump_id` is a unique prefix of exactly one real dump-id in the subproject. If unique → normalize the citation to the full id and accept. If multiple → emit `ambiguous prefix` complaint listing candidate dump-ids so the retry prompt has new repair info. Also: detect consecutive identical complaints across the renderer's retry loop and short-circuit instead of burning retries on deterministic failure.
  - **Acceptance**: Un-skip and pass the first two tests in the backprop-2 describe block (`normalizes and accepts citation that uses a unique profile-uuid prefix`, `emits ambiguous prefix complaint when profile has multiple dumps`). All existing validator tests still pass.
  - **Depends**: none

## Tier 2 (depends on Tier 1 completion for sequencing)

- [T003] Extractor: normalized evidence_quote matching + configurable retries | est: ~7k tokens | repo: teambrain | req: R005
  - **Files**: `app/src/inference/extractor.ts`, `app/src/server/config.ts` (add `extract_max_retries`), `config.json` (document default)
  - **Change**: Replace strict byte-exact substring check on `evidence_quote` with a normalized match: collapse whitespace runs to single space, normalize curly quotes `" " ' '` to straight, unify ellipsis `…` ↔ `...`, trim leading/trailing punctuation. The normalized quote must be a substring of the normalized body. If match succeeds, optionally snap the idea's `evidence_quote` to the raw dump substring (longest common substring) so downstream citations display clean quotes. Promote `maxRetries` to `config.extract_max_retries` with default 2 so small models can be given more attempts without code changes.
  - **Acceptance**: Un-skip the backprop-1 describe block (`extractFromDump (backprop-1, BUG-2 — fuzzy evidence_quote match)`). Both tests pass. All existing extractor tests still pass. Running a fresh re-synthesize on the smoke-test fixtures (Alice/Bob/Carol dumps already in vault) produces ≥ 3 ideas across the 3 dumps.
  - **Depends**: T001, T002 (sequencing only — no real code dependency, but user wants BUG-3 cleared before BUG-2 is exercised so failures are easy to attribute)

## Tier 3 (depends on Tier 2)

- [T004] Vite dev proxy: SSE passthrough for /api | est: ~4k tokens | repo: teambrain | req: R010 | design: DESIGN.md
  - **File**: `app/vite.config.ts`
  - **Change**: Add a `configure:` handler to the `/api` proxy that (a) sets `selfHandleResponse: false` style passthrough behavior, and (b) on `proxyRes`, copies headers through without buffering — specifically setting `X-Accel-Buffering: no` on the response, and flushing chunks as they arrive. Reference: http-proxy `proxyRes` event + `res.flushHeaders()` pattern. Keep `ws: false` (no websockets in this app).
  - **Acceptance**: Un-skip the `describe.skip "vite.config.ts (backprop-4, BUG-4 — SSE passthrough on /api)"` block in `app/web/lib/use-sse.test.ts`. Source-level assertion passes (`configure:` present, one of the SSE-safe options referenced). Manual verification via Playwright: click Re-synthesize, phase label transitions through merging → rendering → validating within seconds of the corresponding SSE events (proven by cross-referencing `vault/.synthesis-log.jsonl` timestamps).
  - **Depends**: T003

## Tier 4 (depends on Tier 3)

- [T005] useSSE: single-run guarantee, no effect-driven auto-restart | est: ~5k tokens | repo: teambrain | req: R010
  - **Files**: `app/web/lib/use-sse.ts`, `app/web/components/SynthControls.tsx` (audit)
  - **Change**: Audit `use-sse.ts` and `SynthControls.tsx` for any code path that could call `start()` without an explicit user click. Stabilize `start` / `stop` identity via `useRef` (so their identity doesn't thrash every render and induce effect re-runs elsewhere). Confirm `options.auto` is the ONLY effect-driven start, and it's guarded. Add no retry-on-error — on `status=error`, surface the error and wait for a user click. Document at the top of `use-sse.ts` that "this hook is strictly user-driven after mount; never restart on stream end."
  - **Acceptance**: Un-skip the `describe.skip "useSSE (backprop-5, BUG-5 — no client-side auto-restart)"` block. Both source-level assertions pass. Manual verification via Playwright: click Re-synthesize once, wait for completion or error, confirm exactly one `started` SSE event fires (by counting entries in `vault/.synthesis-log.jsonl` with `event: started`).
  - **Depends**: T004

## Out of scope

- Embeddings / retrieval for exploration (R011) — unchanged.
- Graph canvas styling beyond spec (R008 UI) — unchanged.
- Backprop-log.md is gitignored per repo policy — executor does NOT commit log changes.
