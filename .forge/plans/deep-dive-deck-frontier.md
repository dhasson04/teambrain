---
spec: deep-dive-deck
total_tasks: 8
estimated_tokens: 50000
depth: standard
---

# Deep-Dive-Deck Frontier

Forensic presentation at `presentation-deep-dive/`, sibling to `presentation/`. 15 slides grouped into 6 acts. Standard depth, ~6k tokens per task, one commit per task.

## Tier 1 (no dependencies)

- [T001] Scaffold `presentation-deep-dive/` Vite app + theme parity + slide framework | est: ~8k tokens | repo: teambrain | req: R001, R002, R003 | design: presentation/src/index.css
  - **Files**: `presentation-deep-dive/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/components/StepIndicator.tsx`, `README.md`
  - **Change**: Copy the structural shape of `presentation/` — Motion, nav keybindings, `StepIndicator`, `SlideProps` type with `isActive`. Copy `src/index.css` verbatim from `presentation/src/index.css` to guarantee theme parity. Vite dev port 5180 (avoid collision with app:5173 and pitch:4173). `README.md` states the deck's purpose and tone contrast with `presentation/`.
  - **Acceptance**: `bun install && bun run dev` starts on :5180 with no console errors. Navigation (arrows/space/enter/r) works. A placeholder `Title.tsx` slide renders with the same accent color and font as `presentation/`'s Title slide.
  - **Depends**: none

## Tier 2 (parallel after scaffold — each act is independent)

- [T002] Act 1 "What goes in" — 3 slides | est: ~6k tokens | repo: teambrain | req: R004 | design: presentation/src/index.css
  - **Files**: `src/components/slides/Inputs.tsx`, `DumpAnatomy.tsx`, `MaterialsAndProblemClaim.tsx`
  - **Content**: Inputs names the 3 surfaces (dumps/materials/problem) with vault paths + API routes. DumpAnatomy pulls Bob's dump from `app/vault/projects/acme-q2-onboarding/subprojects/funnel-investigation/dumps/6827d9fc-*.md` and labels the frontmatter fields. MaterialsAndProblemClaim sets up the R007 finding by stating what the README/pitch deck implies, without revealing the answer yet.
  - **Acceptance**: All 3 slides render, advance via arrow keys, use only existing theme tokens. The dump excerpt is a REAL string from the vault (copy, don't fabricate).
  - **Depends**: T001

- [T003] Act 2 "How it's transformed" — 4 slides | est: ~8k tokens | repo: teambrain | req: R005 | design: presentation/src/index.css
  - **Files**: `src/components/slides/ExtractStage.tsx`, `MergeStage.tsx`, `RenderStage.tsx`, `ValidatorStage.tsx`
  - **Content**: Each slide shows verbatim prompt/schema with file:line callout (e.g. `extractor.ts:37-56`), plus one real artifact: a JSONL log line from `app/vault/.synthesis-log.jsonl`, an `ideas.json`/`connections.json` excerpt from the completed synthesis run, a `latest.md` body fragment, and the validator rule flow.
  - **Acceptance**: Prompts shown are BYTE-IDENTICAL to the source (copy via Read tool, don't retype). JSONL line comes from the actual log.
  - **Depends**: T001

- [T004] Act 3 "How it connects" — 2 slides | est: ~5k tokens | repo: teambrain | req: R006 | design: presentation/src/index.css
  - **Files**: `src/components/slides/Clustering.tsx`, `GraphRender.tsx`
  - **Content**: Clustering names agreement/contradiction/related, shows a real cluster from `ideas.json` (with member idea_ids and contributing dumps), calls out that clustering is LLM-based with no embeddings (R011 deferred). GraphRender embeds the real Connections-tab screenshot saved at `.playwright-mcp/connections-tab-rendered.png` (or a fresh one captured during build), explains 40-node cap, filter chips, d3-force.
  - **Acceptance**: Real cluster data displayed. Screenshot is the actual one from the 2026-04-17 verification run.
  - **Depends**: T001

- [T005] Act 4 "The big lie" — 1 slide [LOAD-BEARING] | est: ~5k tokens | repo: teambrain | req: R007 | design: presentation/src/index.css
  - **File**: `src/components/slides/MaterialsDontFeed.tsx`
  - **Content**: Heading names the finding directly. Shows the grep commands + results verifying materials/problem.md are used only in server/routes + web components, never referenced in app/src/inference/. Shows the implication: the kickoff meeting transcript pasted during the smoke test had ZERO effect on synthesis. Suggests (not prescribes) a fix: concatenate problem.md + materials/*.md into a `<project-context>` block prepended to merge or render prompts.
  - **Acceptance**: Finding stated in the heading. Grep evidence shown with clear before/after (zero matches inside inference/, multiple matches inside server/routes and web/). No softening language.
  - **Depends**: T001

- [T006] Act 5 "Why the output is poor" — 3 slides | est: ~8k tokens | repo: teambrain | req: R008 | design: presentation/src/index.css
  - **Files**: `src/components/slides/FailureModes.tsx`, `ModelCapacity.tsx`, `HardwareBudget.tsx`
  - **Content**: FailureModes has a side-by-side table (promise vs actual) with real numbers from the smoke test (0 ideas from 2 of 3 dumps, validator 3/3 fail, etc.). ModelCapacity explains gemma3:4b limits on verbatim quote grounding and structural prompt adherence, with reference points to gemma3:12b and Sonnet. HardwareBudget does the A1000 6GB math with specific model-size numbers.
  - **Acceptance**: Every number on FailureModes traces to a real log entry or smoke-test artifact. No vibes.
  - **Depends**: T001

- [T007] Act 6 "What we fixed, what's still broken" — 2 slides | est: ~5k tokens | repo: teambrain | req: R009 | design: presentation/src/index.css
  - **Files**: `src/components/slides/BackpropFixes.tsx`, `WhatsNext.tsx`
  - **Content**: BackpropFixes reads the 5 entries from `.forge/history/backprop-log.md` and renders each row: bug → change → evidence (commit SHA, test passes, smoke-test metric). WhatsNext lists the open issues: prompt adherence, no embeddings, materials not in pipeline (from T005 finding), 4B ceiling. Ranked by biggest-quality-lever.
  - **Acceptance**: Commit SHAs are the real ones (`dee4af3, 2a91a4b, 229d3ff, 9dd5bda, 44ddd47, 14fd670`). WhatsNext ranking is Lucas's judgment call per spec, not a generic list.
  - **Depends**: T001

## Tier 3 (depends on Tier 2)

- [T008] Build + preview config + README deploy notes | est: ~3k tokens | repo: teambrain | req: R010
  - **Files**: `presentation-deep-dive/vite.config.ts` (build outDir), `README.md`, wire all 11 slides into `App.tsx`'s SLIDES array in deck order (Title → Inputs → DumpAnatomy → MaterialsAndProblemClaim → ExtractStage → MergeStage → RenderStage → ValidatorStage → Clustering → GraphRender → MaterialsDontFeed → FailureModes → ModelCapacity → HardwareBudget → BackpropFixes → WhatsNext) [16 slides total including Title]
  - **Change**: `bun run build` emits to `dist-deep-dive/` (avoid colliding with `app/dist-web/` or `presentation/`'s output). `bun run preview` serves the static build. README documents the optional `/deep-dive/` GitHub Pages subpath — no actual deploy required.
  - **Acceptance**: `bun run build` succeeds with no TS errors, `bun run preview` serves a static deck that navigates keyboard-only.
  - **Depends**: T002, T003, T004, T005, T006, T007

## Out of scope

- Integrating materials into the pipeline (separate fix, not this deck).
- Fixing prompt adherence (model emitting "## Concerns" instead of "## Disputed").
- Embeddings / retrieval (deferred per spec-synthesis R011).
- Replacing the pitch deck at `presentation/`.
- Animated graph visualisations — static screenshot sufficient.
