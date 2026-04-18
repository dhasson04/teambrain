---
domain: citation-fidelity
status: approved
created: 2026-04-18
complexity: medium
linked_repos: [teambrain]
design: DESIGN.md
parent_spec: pipeline-quality
branch: forge/citation-fidelity
---

# Citation Fidelity Spec

## Overview

Close the citation-hallucination gap surfaced by the 2026-04-18 Playwright user-test on Fixture A. Commit `0bcd345` on `forge/pipeline-quality` landed two belt-and-suspenders tolerances at the validator level to unblock end-to-end synthesis, but the root cause lives one layer up: the render JSON schema leaves `author` and `dump_id` as free-form strings, so gemma3:4b hallucinates both. This spec moves the constraint up to the schema where Ollama's token-level constrained decoding makes hallucination structurally impossible (same leverage T002 used for section headers, now one field deeper).

Research anchors: Ollama structured outputs supports `enum` on string fields with token-level constrained decoding (docs.ollama.com/capabilities/structured-outputs, ollama.com/blog/structured-outputs). CiteGuard (arXiv 2510.17853) demonstrates retrieval-augmented validation as the next layer above schema constraints; we note but defer that approach.

## Requirements

### R001: Enum-constrain `author` in render schema
The `author` field in every citation object in `RENDER_FORMAT` (`app/src/inference/renderer.ts:35`) must be an `enum` of the display names of profiles active in this subproject, resolved from `vault/profiles.json` filtered by who authored at least one dump in the current subproject.

**Acceptance Criteria:**
- [ ] `renderer.ts` `RENDER_FORMAT` is a function that takes `profiles: string[]` and returns the JSON schema with `author: { type: "string", enum: profiles }` in every citation position.
- [ ] `renderSynthesis` resolves the profile list before building the schema, reading from the loaded `AttributionFile` (which already has display names after `attributionWithDisplayNames`).
- [ ] Unit test in `renderer.test.ts`: given a profile list `["alice", "bob", "carol"]`, model response with `author: "dan"` is rejected by Ollama before it reaches application code (mock the ollama client to verify the schema the service sends includes the enum).
- [ ] Acceptance: running `POST /api/projects/acme-q2-onboarding/subprojects/funnel-investigation/synthesize` produces zero lines in server output with the pattern `soft author mismatch: cited "..." on dump ... authored by "..."` (the T015 warning emitted when author mismatch would have triggered pre-enum).

### R002: Enum-constrain `dump_id` in render schema
Same treatment for the `dump_id` field — enum of the actual dump ids from `listDumps(project, sub)` for the current synthesis run.

**Acceptance Criteria:**
- [ ] `RENDER_FORMAT` factory accepts `dumpIds: string[]` and places `dump_id: { type: "string", enum: dumpIds }` in every citation position.
- [ ] Unit test verifies: schema with 3 valid dump-ids passed to the renderer rejects a model response that tries to emit a `<dump_id>-iN` shaped string (the exact T008-era hallucination pattern).
- [ ] Acceptance: running Re-synthesize on Fixture A produces a `latest.md` where every `[author, dump_id]` citation's dump-id is a verbatim match for an entry in `listDumps` for that subproject — no suffix-strip recovery needed.

### R003: Remove the T015 soft author-warn
With R001 in place, the `console.warn` branch in `validator.ts:163-171` becomes unreachable because the enum prevents the model from emitting an invalid author in the first place. Remove the branch and the comment block around it. Keep the `-iN` suffix-strip defensive code (`validator.ts` lines around 140-155) as a belt-and-suspenders guard against future schema bugs — it's 5 lines of cheap insurance against a documented model pathology.

**Acceptance Criteria:**
- [ ] `console.warn("[validator] soft author mismatch...")` line no longer present in `validator.ts`.
- [ ] The comment block referencing "gemma3:4b hallucinates the author name on agreement-cluster citations" is removed.
- [ ] `-iN` suffix-strip block (the `replace(/-i\d+$/, "")` fallback) is preserved with a comment explaining it remains as defensive code in case the enum fails open (e.g. ollama#15260 regression).
- [ ] `bun test` passes; `validator.test.ts` regression test from T013 still green.

### R004: Fixture-A materials-citation integration test
Freeze the 2026-04-18 win where T009 contextual retrieval first successfully cited materials-only facts ("Dan to slice cohort data by company size", "Decide by 2026-02-26 to leave headroom for May launch") in the Move forward section. Add a test that runs the pipeline against Fixture A and asserts the rendered body contains at least one substring that is present in `materials/*.md` or `problem.md` but absent from every file under `dumps/`.

**Acceptance Criteria:**
- [ ] New test file `app/src/inference/pipeline.integration.test.ts` (or co-located under `renderer.integration.test.ts`).
- [ ] Test reads all `materials/**/*.md` and `problem.md` bodies for Fixture A, reads all `dumps/**/*.md` bodies, computes the set-difference of distinctive substrings, and asserts at least one such substring appears in the rendered markdown body produced by a full pipeline run.
- [ ] Test is marked `@integration` or similar so it can be run selectively; excluded from default `bun test` if cold-start model loads would make CI slow. Include a script command `bun test:integration` in `app/package.json`.
- [ ] Test passes on current `forge/pipeline-quality` HEAD with R001-R003 applied (i.e., verifies the win and the enum-constraint work together).

## Future Considerations

- **Attribution influence scoring** (Correctness is not Faithfulness, ICTIR 2025): measure whether the model actually conditions on retrieved chunks vs post-rationalizing citations. Candidate follow-up spec if users report "citation looks right but the content drifted from what materials actually said." Cheap instrumentation: diff render output with retrieval on vs off, count material-only substrings in each.
- **Pair-constrained citations** (author and dump_id must be a valid pair, not just independently valid): extend the JSON schema to a `oneOf` of explicit `{author, dump_id}` pairs. Bigger schema, more tokens, but eliminates the "right author, wrong dump" class of errors. Defer until a concrete bug report motivates it.
- **CiteGuard-style retrieval re-verification**: on validator complaint (if any still exists after R003), re-fetch the dump body and check whether the bullet text appears as a close paraphrase. Bigger scope than enum constraints; revisit if enum-constrained approach still leaks.
