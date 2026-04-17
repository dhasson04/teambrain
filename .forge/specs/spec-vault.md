---
domain: vault
status: approved
created: 2026-04-17
complexity: medium
linked_repos: [teambrain]
---

# Vault Spec

## Overview

The vault is the on-disk source of truth for Teambrain. Plain markdown + JSON files in
`./vault/`, organized as Project > Subproject. Survives any UI rewrite, any LLM rewrite,
and any database migration because there is no database. The friend's app reads and writes
this structure; the synthesis agent and UI both consume it.

## Folder shape

```
vault/
  profiles.json
  projects/
    <project-slug>/
      _meta.json
      subprojects/
        <subproject-slug>/
          _meta.json
          problem.md
          materials/
            <slug>.md
          dumps/
            <author>-<iso-ts>.md
          ideas/
            ideas.json
            connections.json
            attribution.json
          synthesis/
            latest.md
            history/
              <input-sha>.md
          .cache/
            chunk-hashes.json
            last-synth-input.json
```

## Requirements

### R001: Vault folder skeleton initialization
Initializing the vault creates the directory if absent, plus a `profiles.json` with one
default profile so the app is usable immediately after `bun run dev`.

**Acceptance Criteria:**
- [ ] On backend startup, if `./vault/` does not exist, it is created with `profiles.json` containing one default profile
- [ ] `profiles.json` schema: `{ profiles: [{ id, display_name, color, created }] }`
- [ ] Existing vault is not overwritten or migrated; backend reads as-is
- [ ] Vault root configurable via `TEAMBRAIN_VAULT` env var (default `./vault`)

### R002: Project CRUD
Create, rename, archive (soft-delete), and list projects. Slug auto-generated from display
name (kebab-case), unique within vault.

**Acceptance Criteria:**
- [ ] `POST /api/projects { display_name }` creates `projects/<slug>/_meta.json`
- [ ] `_meta.json` schema: `{ slug, display_name, created, archived: false }`
- [ ] `GET /api/projects` lists non-archived projects from disk (no in-memory cache for POC)
- [ ] `PATCH /api/projects/:slug { display_name }` updates `_meta.json` only; folder slug stays stable for refs
- [ ] `DELETE /api/projects/:slug` sets `archived: true` (soft delete); folder remains on disk
- [ ] Slug collision returns 409 with the existing slug

### R003: Subproject CRUD
Same shape as projects, scoped under a project. One level of nesting only.

**Acceptance Criteria:**
- [ ] `POST /api/projects/:project/subprojects { display_name }` creates `subprojects/<slug>/` with `_meta.json`, empty `materials/`, `dumps/`, `ideas/`, `synthesis/`, `.cache/`
- [ ] `GET /api/projects/:project/subprojects` lists non-archived subprojects
- [ ] `PATCH` and `DELETE` mirror project semantics
- [ ] Creating a subproject under a non-existent project returns 404

### R004: Problem statement and materials
Each subproject has one editable `problem.md` (frontmatter + markdown) and zero or more
`materials/*.md`. Both are plain markdown so the friend's app or any external editor can read
them.

**Acceptance Criteria:**
- [ ] `PUT /api/subprojects/:id/problem { content }` writes/overwrites `problem.md` with frontmatter `{ updated, updated_by }`
- [ ] `POST /api/subprojects/:id/materials { filename, content }` writes `materials/<slug>.md` with frontmatter `{ title, source, added_by, added_at }`
- [ ] `GET /api/subprojects/:id/materials` returns metadata array (no full content) for list views
- [ ] `GET /api/subprojects/:id/materials/:slug` returns full content
- [ ] Filename collision auto-suffixes with `-2`, `-3`, etc.
- [ ] Accepts `.md` and `.txt`; `.txt` content is wrapped in markdown on save (no transformation)

### R005: Dumps (private to author)
Each user writes their own dumps. Personal text is private — other users see only metadata
of someone else's dumps, never the content. The extracted IDEAS from the dump become shared
in the knowledge graph, but the raw dump stays private.

**Acceptance Criteria:**
- [ ] `POST /api/subprojects/:id/dumps { content }` writes `dumps/<author-id>-<iso-ts>.md` with frontmatter `{ author, created }`; author derived from `X-Profile-Id` header
- [ ] `PATCH /api/subprojects/:id/dumps/:dump-id { content }` only succeeds if dump's frontmatter `author === X-Profile-Id`; otherwise returns 403
- [ ] `DELETE /api/subprojects/:id/dumps/:dump-id` only succeeds for own dumps
- [ ] `GET /api/subprojects/:id/dumps?author=me` returns full content for own dumps
- [ ] `GET /api/subprojects/:id/dumps?author=all` returns metadata only `[{ id, author, created, length }]`
- [ ] No endpoint returns another user's dump content

### R006: Identity (profile picker, no auth)
POC has no authentication. Each browser picks an identity from `profiles.json` or creates a
new one. Backend trusts `X-Profile-Id` header for ownership decisions on dumps.

**Acceptance Criteria:**
- [ ] `GET /api/profiles` returns the profiles list
- [ ] `POST /api/profiles { display_name }` appends a new profile, auto-assigns `id` (uuid) and `color` (deterministic from id)
- [ ] All write endpoints require `X-Profile-Id` header matching an existing profile id; missing or unknown returns 401
- [ ] Frontend stores selected profile id in `localStorage`, sends as header on all mutations

### R007: Idea + connection storage (synthesis output)
After synthesis runs, three JSON sidecars are written. They are derived data and can be
regenerated from the dumps + LLM, so they live alongside the dumps and are read by the UI.

**Acceptance Criteria:**
- [ ] `ideas.json` schema: `[{ idea_id, statement, type, cluster_id, contributing_dumps[], created }]` where `type` ∈ `theme | claim | proposal | concern | question | deliverable`
- [ ] `connections.json` schema: `[{ edge_id, from_idea, to_idea, kind, weight }]` where `kind` ∈ `agree | contradict | related`, `weight` ∈ [0, 1]
- [ ] `attribution.json` schema: `{ <idea_id>: [{ dump_id, author, verbatim_quote }] }`
- [ ] All three written atomically: write to `<filename>.tmp` then rename
- [ ] Every idea must have at least one entry in `attribution.json`
- [ ] Every contradiction edge must reference two ideas with explicit opposing claims (not just topical differences)

### R008: Synthesis storage and history
Each synthesis run writes to `synthesis/latest.md`; the previous `latest.md` is archived to
`history/<input-sha>.md` so the team can see how synthesis changed over time.

**Acceptance Criteria:**
- [ ] New synthesis writes to `synthesis/latest.md.tmp` then renames over `latest.md`
- [ ] Previous `latest.md` is moved to `history/<sha>.md` where `sha` is BLAKE3 of sorted dump ids that fed the run
- [ ] History capped at 20 entries; oldest pruned on overflow
- [ ] Synthesis file is plain markdown with frontmatter `{ created, dump_count, model }`

### R009: Chunk hash cache for incremental synthesis
Re-running synthesis when only one dump changed should not re-extract ideas from unchanged
dumps. BLAKE3 hash per dump enables this.

**Acceptance Criteria:**
- [ ] `chunk-hashes.json` maps `dump_id -> blake3` of normalized dump content
- [ ] `last-synth-input.json` stores `[{ dump_id, hash }]` of the dumps that produced `latest.md`
- [ ] On synthesis trigger: diff current hashes against `last-synth-input`; only re-extract dumps whose hash changed or are new
- [ ] Removing a dump removes its hash entry and triggers a merge re-pass
- [ ] Cache survives backend restart (it is just files on disk)
