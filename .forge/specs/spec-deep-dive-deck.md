---
domain: deep-dive-deck
status: approved
created: 2026-04-17
complexity: medium
linked_repos: [teambrain]
design: presentation/src/index.css
parent_style_ref: presentation/
---

# Deep-Dive Deck Spec

## Overview

A forensic presentation (`presentation-deep-dive/`) that dissects the Teambrain agentic LLM system end-to-end: what goes in, how it's transformed, how ideas become clusters and contradictions, what comes out, and — honestly — why the output quality on a 4B-param local model is poor, with concrete evidence from the 2026-04-17 smoke test.

This deck is the companion to `presentation/` (the Product Hunt pitch), NOT a replacement for it. Same visual style and theme tokens, different tone: the pitch says "personal dumps → shared synthesis"; this deck says "here's the exact prompt, here's the real output, here's why it fell over."

Audience: Lucas himself and any technical collaborator who wants to reason about the system. Not for marketing.

## Hard rules

1. Reuses the theme tokens (`--accent`, `--agreement`, `--surface`, etc.) from `presentation/src/index.css`. No new colors.
2. Every forensic claim cites a real artifact: file:line for code, verbatim prompt text for prompts, real vault excerpts for input/output examples, real JSONL line counts for pipeline calls.
3. No softening. If a feature advertised in the README or pitch deck doesn't actually do what it claims (e.g., materials-in-pipeline), the slide says so.
4. One idea per slide. No dense text dumps.
5. Runs as a standalone Vite app at `C:\dev\teambrain\presentation-deep-dive/`, independent of the main app and the pitch deck.

## Requirements

### R001: Scaffold `presentation-deep-dive/` as a sibling Vite app
A new directory with its own `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`. Can be started independently with `bun run dev` from inside that folder.

**Acceptance Criteria:**
- [ ] Directory `presentation-deep-dive/` exists at repo root, sibling to `presentation/` and `app/`
- [ ] `bun install` succeeds
- [ ] `bun run dev` starts on a port that doesn't collide with `app/` (3001/5173) or `presentation/` (whatever port that uses) — suggest 5180
- [ ] `index.html` loads the app shell with no console errors
- [ ] `README.md` at the deck root documents: purpose, how to run, tone contrast with `presentation/`

### R002: Theme-token parity with `presentation/`
Import or copy the CSS variable definitions from `presentation/src/index.css` so both decks render with identical colors, fonts, spacing primitives, and motion timing.

**Acceptance Criteria:**
- [ ] `presentation-deep-dive/src/index.css` contains all the `--accent`, `--accent-secondary`, `--agreement`, `--contradiction`, `--surface`, `--surface-elevated`, `--border`, `--border-light`, `--text-primary`, `--text-secondary`, `--text-muted`, `--background`, `--info` variables defined in `presentation/src/index.css`
- [ ] Same font stack, same base font sizes, same motion easing durations
- [ ] A side-by-side screenshot (first slide of each deck) shows the same header font, the same background color, the same accent color
- [ ] If `presentation/src/index.css` is edited in the future, a comment in `presentation-deep-dive/src/index.css` tells the maintainer to re-sync (no build-time enforcement needed for POC)

### R003: Slide framework matching `presentation/src/App.tsx`
Same navigation affordances: arrow keys / space / enter advance, arrow left retreats, `r` resets. Bottom-left and bottom-right round buttons. Step indicator bottom-center. AnimatePresence mode="wait" for slide transitions. `SlideProps` type with `isActive` prop so each slide can stage its own reveal.

**Acceptance Criteria:**
- [ ] `src/App.tsx` mirrors the existing structure in `presentation/src/App.tsx` — same navigation callback shape, same keyboard handlers, same button JSX
- [ ] A `StepIndicator` component exists with the same API as `presentation/src/components/StepIndicator.tsx`
- [ ] Each slide component receives `{ isActive: boolean }` and uses it to gate animation start (see `presentation/src/components/slides/Pipeline.tsx` for the reference pattern)
- [ ] Smoke test: press right arrow 15 times, page steps through all slides without console errors and without losing animation state

### R004: Act 1 — "What goes in" (3 slides)
Three slides covering the complete input surface: per-user brain dumps, meeting notes / pasted materials, project problem statement.

**Acceptance Criteria:**
- [ ] Slide `Inputs.tsx`: names the three input surfaces (dumps, materials, problem) with their vault paths (`vault/projects/.../dumps/*.md`, `.../materials/*.md`, `.../problem.md`) and the API routes that write them
- [ ] Slide `DumpAnatomy.tsx`: shows a real verbatim dump excerpt from the 2026-04-17 smoke test (e.g. Bob's dump with frontmatter visible) and labels the fields
- [ ] Slide `MaterialsAndProblemClaim.tsx`: states what the README/pitch-deck implies about materials influencing synthesis. Sets up the R007 finding without revealing it yet.

### R005: Act 2 — "How it's transformed" (4 slides)
Four slides walking through the pipeline stages, each showing the exact prompt and a real call's input/output.

**Acceptance Criteria:**
- [ ] Slide `ExtractStage.tsx`: shows the `EXTRACTION_INSTRUCTIONS` constant verbatim from `extractor.ts:37-56` with `file:line` callout. Shows a real JSONL log entry (prompt_tokens, completion_tokens, duration_ms) from `vault/.synthesis-log.jsonl`.
- [ ] Slide `MergeStage.tsx`: shows the merger's output schema (`MergeResponseSchema` in `merger.ts`), explains clusters vs contradictions vs edges, shows a real `ideas.json` + `connections.json` excerpt from a completed synthesis run.
- [ ] Slide `RenderStage.tsx`: shows `RENDER_INSTRUCTIONS` verbatim from `renderer.ts:9-32` with the post-backprop-2 clarifications about display_name and full dump-id. Shows a real `latest.md` body excerpt.
- [ ] Slide `ValidatorStage.tsx`: shows `validateCitations` flow at a high level — parse citations → check dump existence → check author → prefix tolerance (post-backprop-2) → emit complaints. References `validator.ts` with line ranges.

### R006: Act 3 — "How it connects" (2 slides)
Two slides on the cross-dump layer: clustering and the knowledge graph.

**Acceptance Criteria:**
- [ ] Slide `Clustering.tsx`: explains that "agreement" = cluster of size ≥ 2, "contradiction" = explicit edge with a reason, "related" = topical. Shows one real cluster from a completed run (multiple idea_ids, their contributing dumps). Calls out that clustering is a single LLM pass on ideas with NO embeddings (cosine similarity deferred per spec-synthesis R011).
- [ ] Slide `GraphRender.tsx`: shows the actual Connections tab screenshot from the 2026-04-17 verification run (the one-node "Splitting fu..." graph). Explains the node-positioning (d3-force), the 40-node cap, the filter chips. Cites `app/web/components/SubprojectView/ConnectionsTab.tsx` or equivalent.

### R007: Act 4 — "The big lie" (1 slide) [LOAD-BEARING]
The finding slide. Materials (`materials/*.md`) and the problem statement (`problem.md`) are read by server routes that feed the UI, but **no reference to either appears in the inference pipeline**. They influence the sidebar and the Main tab and the activity feed — nothing else.

**Acceptance Criteria:**
- [ ] Slide `MaterialsDontFeed.tsx`: names the finding in the slide heading (not buried)
- [ ] Shows grep evidence: the exact `grep` command run against `app/src/inference/` that returns zero matches for `materials|problem\.md|readProblem|listMaterials`
- [ ] Shows the opposite grep: the same pattern against `app/src/server/routes/` and `app/web/` that DOES return matches (server/routes/materials.ts, web/lib/api.ts, web/components/SubprojectView/MainTab.tsx) — explaining where they ARE used
- [ ] Includes the implication: the user pasted a kickoff meeting transcript as a material during the smoke test, and it had **zero effect** on the synthesis output — the LLM never saw it
- [ ] Suggests (not prescribes) a fix: add a pipeline stage that concatenates `problem.md` + `materials/*.md` into a `<project-context>` block prepended to the merge or render prompt

### R008: Act 5 — "Why the output is poor" (3 slides)
Three slides doing the forensic post-mortem on the 2026-04-17 smoke test results.

**Acceptance Criteria:**
- [ ] Slide `FailureModes.tsx`: side-by-side table. Left column: what the README/pitch deck promises ("each dump yields a structured list of ideas", "agreement / disputed / move forward sections", "citations validated verbatim"). Right column: what actually happened on gemma3:4b ("0 ideas from 2 of 3 dumps", "render failed validation 3/3 attempts", "model stripped timestamp suffix from dump-ids"). Numbers not vibes.
- [ ] Slide `ModelCapacity.tsx`: explains what gemma3:4b can and can't do — specifically, why verbatim-quote grounding is hard at 4B (Q4_K_M quantization normalizes whitespace when echoing), why 3-section prompts with structural constraints get partial adherence, why JSON mode + long output is where the biggest quality cliff is. Include a row on gemma3:12b and Claude Sonnet as reference points for what better looks like.
- [ ] Slide `HardwareBudget.tsx`: explicit math on RTX A1000 6GB. Model size (gemma3:4b Q4_K_M ≈ 2.6 GB), KV cache, headroom. Why 4B is the ceiling on this GPU and what 7B would require. Why Cloud API (Sonnet) is an option but contradicts the local-first positioning in `spec-synthesis.md`.

### R009: Act 6 — "What we fixed, what's still broken" (2 slides)
The honest current-state slide and the forward list.

**Acceptance Criteria:**
- [ ] Slide `BackpropFixes.tsx`: list of the 5 bugs from `.forge/history/backprop-log.md` with status (BUG-1 fixed `dee4af3`, BUG-2 fixed `9dd5bda`, BUG-3 fixed `2a91a4b`+`229d3ff`, BUG-4 fixed `44ddd47`, BUG-5 fixed `14fd670`). Each row: what was wrong → what changed → evidence (test passes, commit SHA, or smoke-test metric before/after).
- [ ] Slide `WhatsNext.tsx`: the open list — prompt adherence (model still emits "## Concerns" instead of "## Disputed / ## Move forward"), no embeddings (retrieval is statement-string cosine — see spec-synthesis R011), materials not in pipeline (from R007 of this spec), 4B model ceiling. Ranked by deck's own "biggest quality lever" judgment.

### R010: Deployable + presentable
Can be served as static HTML via `bun run build` + `bun run preview`, and optionally deployed to the same `dhasson04.github.io/teambrain/` GitHub Pages subpath under `/deep-dive/`.

**Acceptance Criteria:**
- [ ] `bun run build` produces a static `dist-deep-dive/` (or similar, not colliding with other builds)
- [ ] `bun run preview` serves it on a local port
- [ ] `README.md` in `presentation-deep-dive/` documents the optional deploy path (not required to actually deploy in this spec — just make sure the build output is deploy-ready)
- [ ] Keyboard navigation works in the built version (no hot-reload dependency)

## Out of scope

- Integrating materials into the pipeline (that's a separate fix, not this deck's job).
- Fixing prompt adherence (`## Concerns` instead of `## Disputed`) — also a separate fix.
- Embeddings / retrieval (deferred per the parent synthesis spec).
- Replacing the Product Hunt pitch deck at `presentation/` — this is a sibling, not a rewrite.
- Animated graph visualisations on the graph slide. Static screenshot of the real run is sufficient.

## Source material index

For the executor to assemble real-artifact slides, the following files already exist and should be pulled from during implementation:

- Prompts: `prompts/synthesis.md`, `prompts/exploration.md`, `prompts/_shared/*.md`
- Extractor: `app/src/inference/extractor.ts` (EXTRACTION_INSTRUCTIONS at L37-56)
- Renderer: `app/src/inference/renderer.ts` (RENDER_INSTRUCTIONS at L9-32)
- Merger: `app/src/inference/merger.ts`
- Validator: `app/src/inference/validator.ts`
- Pipeline: `app/src/inference/pipeline.ts`
- Vault sample data: `app/vault/projects/acme-q2-onboarding/subprojects/funnel-investigation/dumps/*.md`, `ideas/*.json`, `synthesis/latest.md`
- Inference log: `app/vault/.synthesis-log.jsonl`
- Backprop history: `.forge/history/backprop-log.md`
- Bug report: `.forge/bug-report-smoke-test.md`
- Existing deck components: `presentation/src/components/slides/*.tsx`, `presentation/src/index.css`, `presentation/src/components/StepIndicator.tsx`
