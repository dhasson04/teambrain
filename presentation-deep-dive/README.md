# Teambrain — Deep Dive Deck

Forensic companion to the pitch deck at `../presentation/`. Same visual style,
opposite tone: the pitch says "personal dumps → shared synthesis", this deck
opens the hood and asks why the output on gemma3:4b was poor.

## Run

```
bun install
bun run dev       # opens http://localhost:5180
```

Keyboard: arrow keys / space / enter advance, left retreats, `r` resets.

## Build

```
bun run build
bun run preview
```

Build output at `dist/`. Optional deploy: `dhasson04.github.io/teambrain/deep-dive/`
(GitHub Pages subpath; the `vite.config.ts` `base:` setting handles the path prefix).

## What's in it

Six acts, 16 slides:

1. **What goes in** — dumps, materials, problem statement
2. **How it's transformed** — extract, merge, render, validate
3. **How it connects** — clustering, graph rendering
4. **The big lie** — materials and problem.md never reach the LLM
5. **Why the output is poor** — failure modes, model capacity, hardware budget
6. **What we fixed, what's still broken** — 2026-04-17 backprop fixes + open list

Every prompt is shown verbatim from `app/src/inference/*.ts`. Every JSONL log
entry and vault excerpt is real — copied from `app/vault/`, not fabricated.

## Theme sync

`src/index.css` is a verbatim copy of `../presentation/src/index.css`. If the
pitch deck's tokens change, re-sync this file by hand.
