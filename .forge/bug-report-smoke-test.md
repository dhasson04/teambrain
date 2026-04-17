# Bug report — post-ship smoke test on forge/initial-impl (2026-04-17)

Host: Windows 11, RTX A1000 6GB, gemma3:4b via Ollama on 127.0.0.1:11434.
Trial: 3 dumps by 3 profiles in project `acme-q2-onboarding` / subproject `funnel-investigation` (~3KB total content).

## BUG-1 (fixed, pushed as dee4af3) — Bun.serve idleTimeout killed synthesis SSE mid-run

**Symptom**: `[srv] [Bun.serve]: request timed out after 10 seconds` within 10s of clicking Re-synthesize. UI appeared frozen in "extracting" phase.

**Root cause**: `Bun.serve({ port, fetch })` in `app/src/server/index.ts:54` used default `idleTimeout=10s`. Ollama extract/merge/render calls on gemma3:4b take 17-34s each with no bytes on the wire between SSE writes, so Bun closed the connection.

**Fix applied**: `idleTimeout: 0` on `Bun.serve`. Validated: 15+ consecutive Ollama calls in a single SSE stream with zero disconnects.

**Spec gap**: spec-synthesis.md has no acceptance criterion about long-lived SSE streams surviving slow-GPU Ollama pipelines. Add one.

## BUG-2 (open, HIGH) — Extractor drops 95%+ of ideas on gemma3:4b

**Symptom**: With 3 rich dumps (~1KB each, 10-15 claim-bearing sentences apiece), only 1 idea was extracted:

```
Alice dump (1cea426c-...): idea_count=1 — "The small-business cohort is 2x more sensitive." (minor aside, not any main claim)
Bob dump   (6827d9fc-...): idea_count=0
Carol dump (e1adf205-...): idea_count=0
```

All of Alice's main claims (split funnel, billing-defer, push-back on legal, Friday deadline), all of Bob's (A/B test argument, billing-minimized proposal, Dan-hasn't-dumped concern), and all of Carol's (billing-position nuance, product-demo proposal, freemium contamination, 11-weeks-until-May) were silently dropped.

**Root cause**: `app/src/inference/extractor.ts:45` rule `"evidence_quote MUST be a verbatim substring of the dump body"` plus hard substring validation in the validator, with `maxRetries = 2`. Gemma3:4b cannot reliably produce byte-exact verbatim quotes (it normalizes whitespace, smart-quotes, trims newlines). The extractor then drops ideas rather than retrying enough to recover.

**Fix direction**:
1. Make verbatim validation fuzzy: normalize whitespace (collapse runs, trim), normalize curly quotes → straight, case-preserve but case-insensitive compare for the match. A match is OK if the normalized quote is a substring of the normalized body.
2. Keep the idea even if the quote normalization fails — instead clip the cited span out of the dump body using longest-common-substring fallback, and record it as the evidence_quote. Better to attribute slightly-approximate quotes than to drop the idea.
3. Raise `maxRetries` for small models — make it configurable via `config.json` with default 2 on ≥7B models, 4 on <7B.

**Spec gap**: spec-synthesis.md requires "every extracted idea has a verbatim evidence quote" but has no acceptance criterion about recall (ideas-extracted per dump on small models). Add a minimum-recall acceptance criterion — e.g., "on dumps ≥300 words, at least 3 ideas must be extracted on gemma3:4b" or similar.

## BUG-3 (open, HIGH — blocks end-to-end) — Renderer cites profile UUID as dump-id

**Symptom**: Render phase fails validation all 3 attempts with:

```
validation failed after 3 attempts:
  dump-id "1cea426c-4f80-4da5-b17d-38caa04313fe" does not exist in this subproject
  (×3 — same ID each attempt)
```

The ID `1cea426c-4f80-4da5-b17d-38caa04313fe` is the **profile/author UUID** for lcuasduys. The actual dump_id is `1cea426c-4f80-4da5-b17d-38caa04313fe-2026-04-17T12-54-55-441z` (profile-id + timestamp suffix). The LLM is stripping the timestamp suffix and citing the shorter string.

**Root cause**: The renderer context in `app/src/inference/renderer.ts:52-60` includes an `attribution` object with both `dump_id` (long, with timestamp) and `author` (short UUID). The prompt in `renderer.ts:7-28` says `[Author, dump-id]` format — the model sees two UUID-shaped fields and picks the shorter, visually-cleaner one for the `dump-id` slot. Exacerbated by the profile UUID being a prefix of the dump_id — a confusing same-string-but-shorter relationship.

**Fix direction**:
1. Rename `author` in the context JSON → `author_display` and resolve to the profile's `display_name` ("Alice", "Bob", "Carol") upstream in the renderer before sending to the LLM. This removes UUID-vs-UUID ambiguity.
2. In `validateCitations` — if the cited dump-id is a proper prefix of an actual dump-id in the subproject, normalize and accept. Defensive fallback for when the model still strips the suffix.
3. Add a test with a renderer mock that emits `[Alice, <profile-uuid-only>]` and verify the validator either accepts (with normalization) or produces a clear complaint the renderer can act on. Currently the complaint is identical for all 3 retries, so the retry prompt adds zero new info.

**Spec gap**: spec-synthesis.md specifies citation format `[Author, dump-id]` but doesn't specify (a) whether Author is display_name or UUID, (b) whether the validator is exact-match or tolerant of prefix/suffix normalization. Add explicit requirements.

## BUG-4 (open, LOW — UX) — Synthesis phase label doesn't update past "extracting…"

**Symptom**: `app/web/components/SynthControls.tsx:66` bottom-bar label shows `extracting…` for the entire 3-4 minute pipeline. Never transitions to `merging`, `rendering`, `validating`. Direct SSE capture shows all events DO fire on the server side.

**Root cause (hypothesis)**: Vite's dev proxy (`app/vite.config.ts:11-17`) is byte-buffering the SSE proxy to :3001, so events arrive at the browser in big batches rather than immediately. Or the `useSSE` hook batches setState calls across multiple events.

**Fix direction**: Either disable compression/buffering on the `/api` proxy (`configure: (proxy) => proxy.on('proxyRes', ...)` to set `X-Accel-Buffering: no` and flush), or test against :3001 directly to confirm, or add `flushHeaders` in the streamSSE handler.

**Spec gap**: spec-ui.md has no acceptance criterion that the phase label must update within N ms of the backend emitting a phase event. Add one.

## BUG-5 (open, LOW — investigate) — Possible client-side synthesis auto-restart

**Symptom**: During my smoke test the backend ran 2-3 full pipeline cycles back-to-back after a single Re-synthesize click. Error event emitted, then a new `started` event fired within seconds without any user action observed. Could not confirm definitively — may have been Playwright ref-staleness re-clicking the button. Worth a careful manual reproduction.

**If real, root cause (hypothesis)**: React 19 Strict Mode double-mounting `SynthControls` and re-running an effect that implicitly calls `start()`, or `useSSE`'s onError path triggering a retry. `app/web/lib/use-sse.ts` does not obviously auto-restart but `start` callback identity changes every render (all props in deps are freshly-allocated), which may interact with any effect that depends on it.

**Fix direction**: Stabilize `start`/`stop` identities (useEvent or refs), ensure no effect calls start(), reproduce with Strict Mode on/off.

**Spec gap**: spec-ui.md has no acceptance criterion that a single click of Re-synthesize produces exactly one backend pipeline run. Add one.

## Out of scope for this fix batch

- Extractor quality on larger models: fine on 7B+ per the tests already passing. This batch is about making 4B usable for the presentation-deck demo.
- Connections graph and Exploration agent: couldn't exercise because synthesis never completed. Retest after BUG-2 and BUG-3 are fixed.
