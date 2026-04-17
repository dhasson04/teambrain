---
domain: ui
status: approved
created: 2026-04-17
complexity: medium
linked_repos: [teambrain]
design: DESIGN.md
---

# UI Spec

## Overview

The frontend is a single-page React app. Three-pane layout (project sidebar, content pane,
bottom bar). Subprojects open into a 4-tab view: Main, My Dump, Connections, Synthesis. A
secondary tab type "New Direction" opens at the project level for the exploration persona.
All visual decisions live in `DESIGN.md`.

## Stack

Vite + React 19 + TypeScript + Tailwind v4 + Motion (Framer Motion) + react-flow + d3-force.
shadcn/ui for primitives. CodeMirror 6 for the dump editor. Vite proxies `/api` to the Bun
backend on `:3001`.

## Requirements

### R001: Bootstrap (clone-and-run)
Project starts with a single command after clone. Friend's repo includes both backend and
frontend; one process serves both in dev.

**Acceptance Criteria:**
- [ ] `bun install` (or `npm install`) installs without errors
- [ ] `bun run dev` starts backend on `:3001` and Vite on `:5173` simultaneously, opens browser
- [ ] Frontend loads app shell within 2 seconds on first paint
- [ ] Hot module reload works for `.tsx` and `.css` edits
- [ ] Single `package.json` script `dev` orchestrates both processes (concurrently or similar)

### R002: Three-pane app shell
Sidebar (fixed ~260px), main content pane (fluid), bottom bar (full-width, ~48px).

**Acceptance Criteria:**
- [ ] Layout fills viewport, no body scroll
- [ ] Sidebar resizable via drag handle (200-400px range), state persisted in localStorage
- [ ] Main pane scrolls internally, sidebar and bottom bar do not
- [ ] Below 1024px viewport, sidebar collapses to hamburger toggle (POC: simple show/hide)

### R003: Project sidebar with hierarchy
Tree of projects, expandable to show subprojects. Selecting a subproject changes the main
pane content.

**Acceptance Criteria:**
- [ ] Sidebar fetches projects + subprojects on mount
- [ ] Each project row: chevron + name; click chevron toggles expanded state
- [ ] Expanded shows subprojects indented; click subproject sets active route
- [ ] Active subproject highlighted with terracotta-tint background per DESIGN.md
- [ ] Inline "+ New project" at bottom of project list and "+ New subproject" inside expanded project
- [ ] Expansion state persisted in localStorage

### R004: Profile picker (bottom-left of sidebar)
Identity selection that drives ownership of dumps. No real auth.

**Acceptance Criteria:**
- [ ] Bottom-left of sidebar shows current profile: avatar circle (initial + DESIGN-palette color) + name + chevron
- [ ] Click opens dropdown with all profiles + "+ New profile" input
- [ ] Selecting a profile updates global state, sets `X-Profile-Id` header on all subsequent fetches
- [ ] "+ New profile" creates via API, auto-selects the new one
- [ ] Selected profile id persisted in localStorage; restored on page load

### R005: Subproject 4-tab layout
Tabs: Main, My Dump, Connections, Synthesis. Active tab persisted in URL hash.

**Acceptance Criteria:**
- [ ] Tab bar above content, each tab clickable
- [ ] Active tab indicator: purple underline + bold text (DESIGN.md tokens)
- [ ] URL hash reflects active tab: `#main, #dump, #graph, #synthesis`
- [ ] Reload preserves active tab
- [ ] Tab content lazy-mounted (My Dump editor not initialized until tab clicked)

### R006: Main tab — problem statement + materials + activity
Editable problem statement, drag-drop materials, recent activity feed.

**Acceptance Criteria:**
- [ ] Problem statement renders as markdown; click to edit (in-place CodeMirror); blur saves via PUT
- [ ] Save indicator appears for 1 second after successful PUT
- [ ] Materials section: drag-drop file zone OR "Paste content" modal trigger
- [ ] Drag-drop accepts `.md` and `.txt`; uploads via POST
- [ ] Materials list shows title, source, added_by chip, added_at relative time
- [ ] Activity feed: last 20 events (dump added, synthesis run) with author chips and relative time

### R007: My Dump tab — private composer
Personal brain dump editor. Shows only your own past dumps in this subproject.

**Acceptance Criteria:**
- [ ] CodeMirror 6 markdown editor at top, ~60% of pane height
- [ ] "Save dump" button writes via POST; success toast within 200ms
- [ ] Below editor: list of your past dumps in this subproject (chronological, newest first)
- [ ] Click past dump loads it into editor for editing; PATCH on save
- [ ] No other users' dumps visible in this tab anywhere
- [ ] Empty state: helpful prompt "Speak your mind. This stays private."

### R008: Connections tab — knowledge graph
react-flow canvas with d3-force layout. Visualizes ideas as nodes, agreement / contradiction
as edges.

**Acceptance Criteria:**
- [ ] Loads `ideas.json` and `connections.json` for current subproject
- [ ] Nodes positioned by force simulation; size proportional to contributing dump count; color by `type` (DESIGN palette)
- [ ] Edge styles: solid green agreement, dashed red contradiction, thin gray related
- [ ] Force simulation settles within 2 seconds, then stops (no perpetual jitter)
- [ ] Cap visible at 40 nodes; remaining grouped into "+N more" cluster bubbles
- [ ] Click node opens side panel with: full statement, contributing authors with avatars, verbatim quote per author, link to source dump
- [ ] Filter controls: by author (multi-select), by type (multi-select), by recency (slider)

### R009: Synthesis tab — three sections
Renders parsed `synthesis/latest.md` into Agreed / Disputed / Move forward sections with
hover-traceable citations.

**Acceptance Criteria:**
- [ ] Three columns on viewports >= 1280px, stacked sections below
- [ ] Each column header uses DESIGN-spec colors (agreement / contradiction / accent-secondary)
- [ ] Each item shows: claim text + author chip stack + inline citation markers
- [ ] Hovering a `[Author, dump-id]` citation reveals tooltip within 100ms with source dump excerpt around the quoted span
- [ ] "Move forward" items have checkboxes (purely UI state, not persisted in POC)
- [ ] "Trust mark" footer in each section: "Generated <time> ago from <N> dumps"
- [ ] Empty state per section: "Not enough dumps yet" with link to My Dump tab

### R010: Re-synthesize button + status indicator
Visible in bottom bar when subproject is selected. Drives the synthesis pipeline.

**Acceptance Criteria:**
- [ ] Button states: idle | running (with rotating step label: extracting -> merging -> rendering -> validating) | success (1s flash) | error (toast with details)
- [ ] Click in idle state POSTs to `/api/subprojects/:id/synthesize` and subscribes to SSE
- [ ] Disabled while running
- [ ] Stop button appears beside it during running state; click cancels via DELETE
- [ ] Status indicator visible from any tab while synthesis is running

### R011: Exploration tab type ("New Direction") at project level
Sibling to subprojects. Opens an exploration-persona chat in its own tab. Persistent across
sessions.

**Acceptance Criteria:**
- [ ] Each project has a "+ New Direction" affordance below its subprojects in the sidebar
- [ ] Click creates a new tab entry in sidebar (under the project), prompts for tab name
- [ ] Selecting the tab opens a chat UI in the main pane (not subproject 4-tab)
- [ ] Chat history persisted to `vault/.exploration/<tab_id>.json`; restored on tab open
- [ ] User can `@subproject` mention to attach context for the next message; mention picker autocompletes
- [ ] Tab can be renamed and closed via right-click menu; closed tabs prompt for confirmation if history non-empty

### R012: SSE streaming chat rendering
Both synthesis progress and exploration chat use SSE. UI renders streaming tokens
incrementally without layout shift.

**Acceptance Criteria:**
- [ ] Tokens appear as they arrive; cursor character blinks at the trailing edge during stream
- [ ] No reflow / layout shift while streaming (reserve space)
- [ ] Stop button cancels server request and stops UI render
- [ ] Connection error displays inline error with retry; auto-retry once after 1 second
- [ ] Long messages scroll user to bottom only if already at bottom (don't yank scroll mid-read)
