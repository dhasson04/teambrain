# Teambrain

A local-first second brain for teams. Each teammate writes private brain dumps about a
project; the system extracts ideas, builds a shared knowledge graph, and synthesizes what
the team agrees on, where they disagree, and what to move on next. Everything runs locally
on Ollama. No cloud, no API keys, no data leaves the team.

> Status: POC. Specs are approved, scaffolding in progress.

---

## See it before you build it

The architecture review presentation lives at:

**[https://dhasson04.github.io/teambrain/](https://dhasson04.github.io/teambrain/)**

11 animated slides covering the problem, the vision, the user flow, the 4-tab subproject
layout, the cross-user pipeline, the knowledge graph, the synthesis output, the dual-agent
infrastructure, the tech stack, and hardware requirements. Use arrow keys to navigate, R to
restart from the title.

To run it locally instead:

```bash
cd presentation
npm install
npm run dev
# opens http://localhost:5174
```

---

## What this repo contains

```
teambrain/
  README.md                    you are here
  DESIGN.md                    visual / interaction spec — single source of truth for UI
  presentation/                Vite + React deck explaining the architecture
  .forge/
    specs/
      spec-vault.md            storage + identity + file structure
      spec-synthesis.md        Ollama integration + extract/merge/render pipeline
      spec-ui.md               React frontend, 4-tab layout, knowledge graph
    plans/                     Forge-generated task frontiers (after /forge plan)
    config.json                Forge plugin configuration
  .github/workflows/
    deploy-pages.yml           auto-deploys the presentation to GitHub Pages
```

The actual application code (frontend + backend) is being scaffolded by the team and will
land in this repo as it's built.

---

## How it works at a glance

1. **You set up a project** with a problem statement and any reference materials (meeting
   transcripts, client briefs, prior notes).
2. **Each teammate writes a brain dump** in their personal "My Dump" tab — text stays
   private to the author.
3. **Click "Re-synthesize"**. The local Gemma model:
   - Extracts ideas, themes, concerns, and proposals from each new dump
   - Merges across all teammates' dumps to find clusters of agreement and explicit
     contradictions
   - Renders a synthesis document with three sections: **Agreed**, **Disputed**, and
     **Move forward**
   - Every claim is hover-traceable to the source dump with author attribution
4. **The "Connections" tab** visualizes ideas as a force-directed knowledge graph with
   agreement edges (green), contradictions (dashed red), and topical relations (gray).
5. **The "New Direction" tab** is a separate exploration agent for brainstorming new ideas
   that may or may not pull in the project's knowledge graph as context.

---

## Run locally (for the actual app, once it's scaffolded)

```bash
git clone https://github.com/dhasson04/teambrain
cd teambrain

# 1. Make sure you have Ollama installed and running
#    https://ollama.com/download
ollama pull gemma3:4b           # or gemma4:4b once tooling is stable
ollama serve                    # leave this running in another terminal

# 2. Install and start the app
bun install                     # or npm install
bun run dev                     # or npm run dev
# opens http://localhost:5173
```

Pick or create your profile from the dropdown at the bottom-left, then either create a new
project or open an existing one. The vault on disk lives at `./vault/` by default
(configurable via `TEAMBRAIN_VAULT` env var).

### For your team

The POC runs as a single shared backend. One teammate runs `bun run dev` on their machine;
others browse to `http://<host-ip>:5173` (use Tailscale, your office LAN, or `--host` flag
on Vite). Each teammate picks their own profile from the dropdown.

A future v2 will move to one-instance-per-laptop with git push/pull as the sync layer.

---

## Hardware requirements

Tested target: laptop with at least 6 GB GPU VRAM or 16 GB unified memory.

| Model | Disk | VRAM | Speed | Notes |
|---|---|---|---|---|
| Gemma 4 4B (Q4_K_M) | ~2.8 GB | ~4 GB | 30-40 tok/s | **Default. Fast iteration.** |
| Gemma 3 12B (Q4_K_M) | ~7 GB | ~8 GB or split to RAM | 5-10 tok/s | Better synthesis prose |
| Gemma 4 12B (Q4_K_M) | ~7 GB | ~8 GB or split to RAM | 5-10 tok/s | Tooling still maturing in early 2026 |

Swap the default by editing the `model:` line in `prompts/synthesis.md` frontmatter. See
[`spec-synthesis.md`](./.forge/specs/spec-synthesis.md) R010 for the full config swap
contract.

---

## Pipeline quality features (feature flags)

The v2 synthesis pipeline (spec-pipeline-quality) pushes structural decisions
out of the 4B LLM and into deterministic code. Every leverage is gated by a
flag in `config.json` so rollback is one line. All flags default to `true`.

```json
{
  "features": {
    "grammar_constrained_output": true,   // R001 — Ollama `format` JSON Schema on extract/merge/render. '## Concerns' drift impossible.
    "embedding_cluster": true,            // R002 — MiniLM + agglomerative clustering replaces the LLM merge pass.
    "nli_contradict": true,               // R003 — DeBERTa-v3-xsmall NLI for contradictions. Degraded mode auto-detected; see nli.ts.
    "hint_block_in_extractor": true,      // R004 — compromise.js noun-phrase hints prepended to extract prompt.
    "retrieval_at_render": true,          // R005 — materials/*.md + problem.md indexed + retrieved at render. Closes "Big Lie".
    "pipeline_decomp": true               // R006 — deterministic confidence from evidence_quote/statement ratio.
  },
  "cluster_threshold": 0.55,              // cosine threshold for agglomerative clustering. Lower = more aggressive clustering.
  "extract_max_retries": 2                // per-dump extract retries on evidence_quote substring failure.
}
```

Dependencies: `@huggingface/transformers` (embeddings + NLI, ~150 MB ONNX cache
under `~/.cache/huggingface/` on first run) and `compromise` (~2 MB pure-JS NLP).
Both install via plain `bun install`. No Python sidecar, no GPU beyond what
Ollama already needs.

Known T008 (NLI) blocker: transformers.js v4.1 + Xenova's NLI ONNX port
doesn't feed `text_pair` through the pipeline. Auto-detected; module returns
`[]` for contradictions gracefully. See `app/src/inference/nli.ts` header for
three follow-up paths.

---

## Tech stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Motion
- **Graph**: react-flow + d3-force
- **Editor**: CodeMirror 6 with markdown mode
- **Backend**: Bun + Hono
- **Validation**: Zod
- **Storage**: plain markdown + JSON files in `./vault/` — no database
- **Hashing**: BLAKE3 for incremental synthesis caching
- **LLM runtime**: Ollama at `127.0.0.1:11434`
- **Default model**: Gemma 4 4B; configurable to Gemma 3 12B via prompt frontmatter
- **Identity**: profile picker + `X-Profile-Id` header (no real auth in POC)
- **Sync (v2)**: git push/pull per user with post-merge hook re-indexing

---

## For contributors / forkers

This is a POC built for a small team's own use. The architecture is intentionally local-first
and runs on consumer laptops. If you want to fork and run your own:

1. Fork the repo on GitHub
2. Clone your fork locally
3. Follow the run-locally steps above
4. Optionally enable GitHub Pages on your fork for the presentation:
   - Settings -> Pages -> Source: GitHub Actions
   - Push any change to `presentation/` and the workflow auto-deploys

The DESIGN.md describes every visual decision so contributions stay consistent. The
`.forge/specs/` directory holds R-numbered requirements with testable acceptance criteria —
new contributors should read these before adding features.

---

## License

TBD by the repo owner.

---

## Project state

Right now (April 2026): specs approved, presentation deployed, `/forge plan` decomposes the
specs into a task frontier the team executes either manually or via `/forge execute`.
