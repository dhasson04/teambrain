---
spec: synthesis
total_tasks: 11
estimated_tokens: 72000
depth: standard
---

# Synthesis Frontier

## Tier 1 (parallel — no dependencies)
- [T001] Config loader + Ollama health check at startup with /api/health route | est: ~6k tokens | repo: teambrain | provides: ollama-health, config-loader | covers: R001, R010
- [T002] Persona prompt files (synthesis.md, exploration.md, _shared/house_style.md, _shared/safety.md) with frontmatter schema | est: ~5k tokens | repo: teambrain | provides: prompt-files | covers: R003
- [T003] Inference call logger appending to vault/.synthesis-log.jsonl + GET /api/stats aggregator | est: ~5k tokens | repo: teambrain | provides: inference-logger | covers: R012

## Tier 2 (depends on Tier 1)
- [T004] Prompt registry with frontmatter parsing, _shared includes resolution, and chokidar hot-reload in dev | est: ~7k tokens | repo: teambrain | depends: T002 | provides: prompt-registry | consumes: prompt-files | covers: R002

## Tier 3 (depends on Tier 2)
- [T005] Inference service abstraction (persona resolution, body-prepend for Gemma, /api/chat streaming, override params, error-as-final-yield, logging hook) | est: ~8k tokens | repo: teambrain | depends: T001, T003, T004 | provides: inference-service | consumes: ollama-health, prompt-registry, inference-logger | covers: R004

## Tier 4 (depends on Tier 3)
- [T006] Per-dump idea extractor with hash-based caching, JSON-mode output, evidence_quote substring validator, 2-retry re-prompt, SSE progress | est: ~8k tokens | repo: teambrain | depends: T005 | provides: idea-extractor | consumes: inference-service | covers: R005
- [T007] Exploration agent endpoint POST /api/exploration/chat with optional retrieve_from_graph tool, per-tab history persistence | est: ~7k tokens | repo: teambrain | depends: T005 | provides: exploration-endpoint | consumes: inference-service | covers: R011
- [T008] Citation enforcement validator (parse [Author, dump-id] markers, verify against vault, re-prompt up to 2x on failure) | est: ~6k tokens | repo: teambrain | depends: T005 | provides: citation-validator | consumes: inference-service | covers: R008

## Tier 5 (depends on Tier 4)
- [T009] Cross-dump idea merger (single LLM pass, JSON output, atomic writes to ideas.json + connections.json + attribution.json) | est: ~7k tokens | repo: teambrain | depends: T006 | provides: idea-merger | consumes: idea-extractor | covers: R006

## Tier 6 (depends on Tier 5)
- [T010] Synthesis renderer producing synthesis/latest.md with Agreed/Disputed/Move-forward sections from clusters + contradictions | est: ~7k tokens | repo: teambrain | depends: T009, T008 | provides: synthesis-renderer | consumes: idea-merger, citation-validator | covers: R007

## Tier 7 (depends on Tier 6)
- [T011] Pipeline orchestrator: POST/DELETE /api/subprojects/:id/synthesize with SSE events, per-subproject serialization queue, cancellation | est: ~6k tokens | repo: teambrain | depends: T006, T010 | provides: synthesis-pipeline | consumes: idea-extractor, synthesis-renderer | covers: R009

## Coverage
- R001 -> T001
- R002 -> T004
- R003 -> T002
- R004 -> T005
- R005 -> T006
- R006 -> T009
- R007 -> T010
- R008 -> T008
- R009 -> T011
- R010 -> T001
- R011 -> T007
- R012 -> T003
