---
domain: synthesis
status: approved
created: 2026-04-17
complexity: medium
linked_repos: [teambrain]
---

# Synthesis Spec

## Overview

The synthesis layer reads dumps, extracts ideas, merges across users, and renders the
"Agreed / Disputed / Move forward" output. It runs entirely on the local Ollama instance
(default `gemma4:4b`). Two personas share the same backend service: synthesis (Mode A,
conservative, citation-grounded) and exploration (Mode B, divergent, generative).

## Hard rules across all synthesis output

1. Every claim cites at least one source dump verbatim with author attribution.
2. The synthesis agent never speculates beyond what dumps actually say.
3. Contradictions are flagged only when the LLM identifies explicit opposing claims, not
   topical differences.
4. Output is strict markdown that the validator can parse for citation markers.

## Requirements

### R001: Ollama health and model bootstrap
Backend startup verifies Ollama is reachable and the configured model is loaded. If not, it
prints a clear error with the exact `ollama pull` command to run.

**Acceptance Criteria:**
- [ ] Backend pings `OLLAMA_URL/api/tags` (default `http://127.0.0.1:11434`) at startup; on failure exits with non-zero and message: "Ollama not reachable at <url>. Start it with: `ollama serve`"
- [ ] If reachable but configured model not in `/api/tags` response, prints: "Model `<name>` not pulled. Run: `ollama pull <name>`" and exits non-zero
- [ ] `GET /api/health` returns `{ ollama: ok|unavailable, model_loaded: <name>|null, registry_loaded: bool }`

### R002: Prompt registry with hot reload
Prompts live as `prompts/*.md` files with YAML frontmatter for runtime params. Registry loads
at startup, hot-reloads in dev when files change.

**Acceptance Criteria:**
- [ ] `prompts/synthesis.md` and `prompts/exploration.md` both load successfully
- [ ] Frontmatter parsed: `id, version, model, temperature, top_p, top_k, description, includes[]`
- [ ] `_shared/*.md` includes resolved at load time (concatenated into the prompt body)
- [ ] In dev mode (`NODE_ENV !== production`), chokidar watches `prompts/**/*.md` and reloads within 500ms of file change
- [ ] Invalid frontmatter logs error and keeps last-good cached version
- [ ] `registry.get(persona_id)` returns parsed object including resolved body

### R003: Two persona definitions shipped in repo
Synthesis and exploration personas committed to the repo with sane defaults.

**Acceptance Criteria:**
- [ ] `prompts/synthesis.md` exists with: `temperature: 0.4, top_p: 0.8, top_k: 40`, role description, hard rule "every claim cites a source dump verbatim"
- [ ] `prompts/exploration.md` exists with: `temperature: 1.0, top_p: 0.95, top_k: 64`, role description, "divergent generation, never invent source data"
- [ ] `prompts/_shared/house_style.md` covers voice, citation format, no-emoji rule
- [ ] `prompts/_shared/safety.md` covers output-control rules (no raw JSON to user, no meta-commentary)
- [ ] Both prompts pass schema validation on startup

### R004: Inference service abstraction
One service handles all calls to Ollama. Persona resolution + sampling parameter merge happen
here. UI never touches Ollama directly.

**Acceptance Criteria:**
- [ ] `inferenceService.run(persona_id, messages, override_params?)` returns an async iterator yielding tokens
- [ ] Resolves persona from registry; prepends prompt body to first user message (Gemma has no system role)
- [ ] POSTs to `/api/chat` on Ollama with `{ model, messages, options: { temperature, top_p, top_k }, stream: true }`
- [ ] `override_params` shallow-merges over registry defaults (e.g. caller can override temperature for one call)
- [ ] First token yielded within 200ms of Ollama's first response chunk
- [ ] Errors surface as `{ error: { code, message } }` final yield instead of throwing mid-stream

### R005: Per-dump idea extraction
For each new or changed dump, run the synthesis persona to extract structured ideas with
verbatim source quotes.

**Acceptance Criteria:**
- [ ] `POST /api/subprojects/:id/extract-ideas` runs extraction for all dumps whose hash differs from `last-synth-input.json`
- [ ] Calls Ollama with `format: "json"` to enforce JSON output
- [ ] Output schema validated: `[{ statement, type, evidence_quote, confidence }]` where `evidence_quote` is verbatim substring of dump
- [ ] Validator rejects extracted ideas whose `evidence_quote` is not a substring of source dump; re-prompts up to 2 times
- [ ] Cache hit logged for skipped dumps; only changed dumps consume tokens
- [ ] Returns SSE stream with progress: `extracting: { dump_id, status }` events

### R006: Cross-dump idea merging
After per-dump extraction, run a single LLM pass on all idea statements to find clusters of
similar ideas and explicit contradictions.

**Acceptance Criteria:**
- [ ] Input: all extracted ideas from current run + their author attribution
- [ ] Output (strict JSON): `{ clusters: [{ cluster_id, member_idea_ids[] }], contradictions: [{ left_idea_id, right_idea_id, reason }], edges: [{ from, to, kind, weight }] }`
- [ ] Persists to `ideas.json` (with cluster_id assigned), `connections.json`, and `attribution.json` atomically
- [ ] Contradictions only included when reason explicitly identifies opposing positions (not topic overlap)
- [ ] Cluster of size 1 is valid (lone idea, no agreement signal)

### R007: Synthesis renderer
Final pass renders the `synthesis/latest.md` with three sections: Agreed, Disputed, Move
forward. Citations in inline format `[Author, dump-id]`.

**Acceptance Criteria:**
- [ ] Reads `ideas.json` + `attribution.json` + `connections.json`
- [ ] Calls synthesis persona with structured input describing clusters + contradictions + deliverables
- [ ] Output format: three `## Section` headers, each item is a markdown bullet ending with one or more `[Author, dump-id]` citations
- [ ] "Agreed" lists clusters of size >= 2 (multi-author ideas)
- [ ] "Disputed" lists contradiction pairs with both sides quoted in the dissenter's voice
- [ ] "Move forward" lists `type: deliverable` ideas with consensus (no attached contradiction)

### R008: Citation enforcement validator
Post-process check on rendered synthesis: every claim has at least one citation, and each
citation references a real dump-id whose author + quoted snippet match.

**Acceptance Criteria:**
- [ ] Parser finds all `[Author, dump-id]` markers in output
- [ ] Each marker validated: dump exists in vault, author matches dump's frontmatter, quoted snippet (if any) appears verbatim in dump
- [ ] On any failure, re-prompt with the validator's complaint included as user message
- [ ] Max 2 retries; third failure surfaces error to UI with raw output preserved for debugging
- [ ] Test: hand-crafted synthesis with fake citation -> validator catches and rejects

### R009: Manual re-synthesize trigger with progress
UI button POSTs to start the full pipeline (extract -> merge -> render). SSE stream reports
progress. Concurrent calls for the same subproject are serialized.

**Acceptance Criteria:**
- [ ] `POST /api/subprojects/:id/synthesize` returns SSE with events: `started, extracting (per dump), merging, rendering, validating, done | error`
- [ ] Events arrive within 500ms of internal state change
- [ ] Second call for same subproject while first in flight returns 202 with `{ queued: true, position: N }`
- [ ] Different subprojects can synthesize in parallel
- [ ] Stop button on UI cancels via `DELETE /api/subprojects/:id/synthesize` (aborts current step)

### R010: Default model + config swap
Model is configurable per persona. Default `gemma3:4b` works on the target laptop (RTX A1000
6GB) and is available in Ollama 0.20.x. Swap to `gemma3:12b` (better synthesis prose) or
`gemma4:4b` (when Ollama publishes it) requires only frontmatter edit.

**Acceptance Criteria:**
- [ ] `prompts/synthesis.md` frontmatter `model:` overrides global default
- [ ] Global default in `config.json` at repo root: `{ model_default: "gemma3:4b" }`
- [ ] Restarting backend after config change picks up new default
- [ ] If specified model not pulled, R001 error fires with `ollama pull` instruction
- [ ] README documents the swap with example: comment-out one model line, uncomment another

### R011: Exploration agent (Mode B) endpoint
Standalone chat endpoint for the exploration persona. Optional subproject context via
`retrieve_from_graph` tool.

**Acceptance Criteria:**
- [ ] `POST /api/exploration/chat { messages, subproject_id? }` returns SSE stream
- [ ] Without `subproject_id`: pure brainstorm, no tools
- [ ] With `subproject_id`: tool `retrieve_from_graph(query: string)` returns top-5 idea statements (cosine similarity over statement strings is fine for POC; embeddings deferred)
- [ ] Tool calls visible in stream as separate events: `tool_call, tool_result`
- [ ] Each chat session keyed by `tab_id` from request; per-tab message history persisted to `vault/.exploration/<tab_id>.json`

### R012: Inference logging for cost visibility
Every LLM call logged for later analysis. Helps the user see how much synthesis "costs" in
seconds and tokens.

**Acceptance Criteria:**
- [ ] `vault/.synthesis-log.jsonl` appended one line per call: `{ ts, persona_id, model, prompt_tokens, completion_tokens, duration_ms }`
- [ ] `GET /api/stats` returns last-24h aggregate per persona: `{ calls, total_tokens, avg_duration_ms }`
- [ ] Append-only; never overwritten
