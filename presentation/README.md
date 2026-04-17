# Teambrain — architecture review presentation

Interactive 11-slide walkthrough of the Teambrain POC architecture. Built for reviewing the design before locking the spec.

## Run

```
cd presentation
npm install
npm run dev
```

Opens at `http://localhost:5174`.

## Navigate

- `Right arrow`, `Space`, `Enter` — next slide
- `Left arrow` — previous slide
- `R` — restart from title
- Click dots at the bottom to jump

## Slides

1. Title
2. The problem — AI made thinking individual
3. The vision — per-project team second brain
4. User flow — kickoff to synthesis
5. App shell — project > subproject > 4 tabs (auto-cycles)
6. Cross-user pipeline — capture, extract, merge, synthesize
7. Knowledge graph — Connections tab visualization
8. Synthesis output — agree, disagree, move forward
9. Dual-agent infrastructure — Mode A synthesis, Mode B exploration
10. Tech stack and bootstrap
11. Hardware reality — what runs on the target laptop

## Stack

Vite + React 19 + TypeScript + Tailwind v4 + Motion (Framer Motion).
