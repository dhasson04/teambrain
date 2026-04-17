---
spec: ui
total_tasks: 16
estimated_tokens: 115000
depth: standard
design: DESIGN.md
---

# UI Frontier

## Tier 1 (parallel — no dependencies)
- [T001] App scaffold (Vite + React 19 + TS + Tailwind v4) and `bun run dev` orchestration | est: ~7k tokens | repo: teambrain | covers: R001 | provides: app-scaffold, dev-orchestrator
- [T002] DESIGN.md token plumbing: CSS variables, Inter + JetBrains Mono fonts, Tailwind v4 theme, base layout primitives | est: ~6k tokens | repo: teambrain | covers: R002 | design: DESIGN.md | provides: design-tokens, css-vars
- [T003] shadcn/ui setup themed via DESIGN tokens (Button, Tabs, Dialog, DropdownMenu) plus lucide-react wiring | est: ~5k tokens | repo: teambrain | covers: R002, R005 | design: DESIGN.md | provides: ui-primitives

## Tier 2 (depends on Tier 1)
- [T004] Three-pane app shell (sidebar 260px resizable + main fluid + bottom bar 48px), localStorage width, <1024px hamburger collapse | est: ~7k tokens | repo: teambrain | covers: R002 | depends: T001, T002 | design: DESIGN.md | consumes: app-scaffold, design-tokens | provides: app-shell, layout-routes
- [T005] API client + global state (profile id header injector, fetch wrapper, project/subproject store, localStorage hydration) | est: ~6k tokens | repo: teambrain | covers: R001, R004 | depends: T001 | consumes: app-scaffold | provides: api-client, profile-store, project-store
- [T006] SSE streaming primitive: `useSSE` hook with token-by-token render, blinking cursor, reserve-space layout, retry-once, smart auto-scroll, stop control | est: ~7k tokens | repo: teambrain | covers: R012 | depends: T001, T002 | design: DESIGN.md | consumes: app-scaffold, design-tokens | provides: sse-hook, stream-renderer

## Tier 3 (depends on Tier 2)
- [T007] Project sidebar tree: fetch projects + subprojects, chevron expand/collapse, active highlight (terracotta tint), inline + New project / + New subproject, expansion persisted | est: ~8k tokens | repo: teambrain | covers: R003 | depends: T004, T005 | design: DESIGN.md | consumes: app-shell, api-client, project-store, ui-primitives | provides: sidebar-tree
- [T008] Profile picker (sidebar bottom-left): avatar+name+chevron, dropdown of profiles, + New profile, persists selection, drives X-Profile-Id header | est: ~6k tokens | repo: teambrain | covers: R004 | depends: T004, T005 | design: DESIGN.md | consumes: app-shell, profile-store, ui-primitives | provides: profile-picker
- [T009] Subproject 4-tab shell: Main | My Dump | Connections | Synthesis with URL hash routing, lazy mount, animated purple underline | est: ~6k tokens | repo: teambrain | covers: R005 | depends: T004, T007 | design: DESIGN.md | consumes: app-shell, sidebar-tree, ui-primitives | provides: subproject-tabs

## Tier 4 (depends on Tier 3)
- [T010] Main tab: editable problem statement (CodeMirror 6 markdown, blur-save, save indicator), drag-drop materials (.md/.txt) + paste modal, materials list, recent activity feed | est: ~9k tokens | repo: teambrain | covers: R006 | depends: T009, T005 | design: DESIGN.md | consumes: subproject-tabs, api-client, ui-primitives | provides: main-tab
- [T011] My Dump tab: CodeMirror 6 composer (~60% pane), Save dump POST + toast, your-dumps-only list (newest first), click-to-edit PATCH, empty state copy | est: ~8k tokens | repo: teambrain | covers: R007 | depends: T009, T005 | design: DESIGN.md | consumes: subproject-tabs, api-client, profile-store | provides: dump-tab
- [T012] Connections tab: react-flow + d3-force graph from ideas.json/connections.json, type-colored nodes, agreement/contradiction/related edges, 40-node cap with "+N more" cluster, settle-and-stop, node detail side panel, author/type/recency filters | est: ~10k tokens | repo: teambrain | covers: R008 | depends: T009, T005 | design: DESIGN.md | consumes: subproject-tabs, api-client, ui-primitives | provides: connections-tab
- [T013] Synthesis tab: parse synthesis/latest.md into Agreed / Disputed / Move forward (3-col >=1280px, stacked below), citation chip hover tooltip with source excerpt within 100ms, author chip stacks, Move-forward checkboxes (UI-only), trust-mark footers, per-section empty states | est: ~9k tokens | repo: teambrain | covers: R009 | depends: T009, T005 | design: DESIGN.md | consumes: subproject-tabs, api-client, ui-primitives | provides: synthesis-tab
- [T014] Bottom-bar Re-synthesize control: idle/running/success/error states with rotating step label, POST + SSE subscribe, Stop (DELETE), persists across tabs while running | est: ~6k tokens | repo: teambrain | covers: R010, R012 | depends: T004, T006, T005 | design: DESIGN.md | consumes: app-shell, sse-hook, api-client | provides: synth-controls
- [T015] New Direction exploration tabs at project level: + New Direction sidebar affordance, named tabs persisted to vault/.exploration/<tab_id>.json, chat UI in main pane, @subproject mention picker autocomplete, rename/close right-click menu with confirm-on-nonempty | est: ~10k tokens | repo: teambrain | covers: R011, R012 | depends: T007, T006, T005 | design: DESIGN.md | consumes: sidebar-tree, sse-hook, api-client, ui-primitives | provides: exploration-tabs

## Tier 5 (final verification)
- [T016] Design compliance verification: audit every rendered component against DESIGN.md checklist (palette via CSS vars only, typography scale, 4px spacing multiples, no emojis, no purple gradients, no AI-sparkle badges, no perpetual motion, no streaming layout shift) and file a remediation list | est: ~5k tokens | repo: teambrain | covers: R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012 | depends: T004, T007, T008, T009, T010, T011, T012, T013, T014, T015 | design: DESIGN.md | consumes: app-shell, sidebar-tree, profile-picker, subproject-tabs, main-tab, dump-tab, connections-tab, synthesis-tab, synth-controls, exploration-tabs

## Coverage
- R001 -> T001, T005
- R002 -> T002, T003, T004, T016
- R003 -> T007, T016
- R004 -> T005, T008, T016
- R005 -> T003, T009, T016
- R006 -> T010, T016
- R007 -> T011, T016
- R008 -> T012, T016
- R009 -> T013, T016
- R010 -> T014, T016
- R011 -> T015, T016
- R012 -> T006, T014, T015, T016
