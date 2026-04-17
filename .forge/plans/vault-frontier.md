---
spec: vault
total_tasks: 10
estimated_tokens: 64000
depth: standard
---

# Vault Frontier

## Tier 1 (parallel — no dependencies)
- [T001] Project scaffolding: package.json, tsconfig, Hono+Zod deps, folder layout, .gitignore for vault/, bun test smoke | est: ~5k tokens | repo: teambrain | provides: project-scaffold | covers: bootstrap
- [T002] Vault path resolver + fs helpers (atomic write via .tmp+rename, slugify, frontmatter parse/serialize, dir ensure) with bun tests | est: ~6k tokens | repo: teambrain | provides: vault-fs-utils | covers: cross-cutting

## Tier 2 (depends on Tier 1)
- [T003] Vault skeleton init on startup + TEAMBRAIN_VAULT env var + default profiles.json seeding; non-destructive on existing vault; tests | est: ~6k tokens | repo: teambrain | provides: vault-init, profiles-store | consumes: project-scaffold, vault-fs-utils | depends: T001, T002 | covers: R001
- [T004] Profiles API (GET/POST /api/profiles) + X-Profile-Id auth middleware (401 on missing/unknown) + deterministic color from id; tests | est: ~7k tokens | repo: teambrain | provides: profile-api, auth-middleware | consumes: vault-init, vault-fs-utils | depends: T003 | covers: R006

## Tier 3 (depends on Tier 2)
- [T005] Project CRUD endpoints (POST/GET/PATCH/DELETE /api/projects) writing projects/<slug>/_meta.json, soft-delete archive, slug 409 collision, stable slug on rename; tests | est: ~7k tokens | repo: teambrain | provides: project-api | consumes: auth-middleware, vault-fs-utils | depends: T004 | covers: R002

## Tier 4 (depends on Tier 3)
- [T006] Subproject CRUD endpoints under /api/projects/:project/subprojects, scaffolds materials/dumps/ideas/synthesis/.cache subdirs on create, 404 on missing parent project; tests | est: ~6k tokens | repo: teambrain | provides: subproject-api, subproject-paths | consumes: project-api, vault-fs-utils | depends: T005 | covers: R003

## Tier 5 (depends on Tier 4)
- [T007] Problem statement + materials endpoints (PUT problem.md, POST/GET materials with frontmatter, list-meta vs full-content, .md/.txt acceptance, -2/-3 collision suffixing); tests | est: ~6k tokens | repo: teambrain | provides: materials-api | consumes: subproject-paths, vault-fs-utils | depends: T006 | covers: R004
- [T008] Dumps endpoints with author-scoped privacy (POST/PATCH/DELETE/GET ?author=me|all), 403 on cross-author writes, metadata-only listing for others, BLAKE3 hash recorded into chunk-hashes.json on write; tests | est: ~8k tokens | repo: teambrain | provides: dumps-api, chunk-hash-writer | consumes: subproject-paths, auth-middleware, vault-fs-utils | depends: T006 | covers: R005, R009 (partial)

## Tier 6 (depends on Tier 5)
- [T009] Synthesis output sidecars: ideas.json, connections.json, attribution.json schemas (Zod) + atomic writer + read endpoints + invariants (every idea has attribution, contradiction edges reference two ideas); tests | est: ~7k tokens | repo: teambrain | provides: ideas-store | consumes: subproject-paths, vault-fs-utils | depends: T006 | covers: R007
- [T010] Synthesis storage + history rotation (write latest.md.tmp -> rename, archive prior latest.md to history/<blake3-of-sorted-dump-ids>.md, prune to 20, frontmatter created/dump_count/model) and incremental cache (last-synth-input.json read/write, diff-by-hash helper, removal triggers merge re-pass flag); tests | est: ~6k tokens | repo: teambrain | provides: synthesis-store, incremental-cache | consumes: dumps-api, chunk-hash-writer, vault-fs-utils | depends: T008, T009 | covers: R008, R009
