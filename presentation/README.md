# Teambrain Presentation

Interactive 11-slide architecture review of the Teambrain POC. Built with Vite + React 19 +
TypeScript + Tailwind v4 + Motion. Same step-navigation pattern as a slide deck.

**Live at: [https://dhasson04.github.io/teambrain/](https://dhasson04.github.io/teambrain/)**

## Run locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:5174](http://localhost:5174).

If you prefer Bun:

```bash
bun install
bun run dev
```

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # serve dist/ locally
```

The production build sets `base: "/teambrain/"` for GitHub Pages compatibility. If you fork
the repo with a different name, update `base` in `vite.config.ts`.

## Navigation

| Key | Action |
|---|---|
| `→` / `Space` / `Enter` | Next slide |
| `←` | Previous slide |
| `R` | Restart from title |
| Click dots at bottom | Jump to any slide |

## Slides

1. **Title** — what Teambrain is
2. **The problem** — AI made thinking individual, teams can't merge
3. **The vision** — per-project, local-first, cross-user synthesis, citation-grounded
4. **User flow** — from project setup to synthesis, animated 4-step timeline
5. **App shell** — project sidebar + 4-tab subproject view, tabs auto-cycle
6. **Cross-user pipeline** — capture, extract, merge, synthesize
7. **Knowledge graph** — animated SVG showing nodes appearing in waves, agreement and
   contradiction edges, author chips
8. **Synthesis output** — three-column Agreed / Disputed / Move forward with citations
9. **Dual-agent infrastructure** — Mode A (synthesis) vs Mode B (exploration), prompt cards
10. **Tech stack** — layers + bootstrap commands + vault structure
11. **Hardware reality** — what runs on a typical laptop, why Gemma 4 4B is the default

## File structure

```
presentation/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx                          slide registry + keyboard nav
    index.css                        Tailwind import + design tokens
    components/
      StepIndicator.tsx              dot navigator + SlideProps type
      slides/
        Title.tsx
        Problem.tsx
        Vision.tsx
        UserFlow.tsx
        SubprojectLayout.tsx
        Pipeline.tsx
        KnowledgeGraph.tsx
        SynthesisOutput.tsx
        DualAgent.tsx
        Stack.tsx
        Hardware.tsx
```

Each slide is self-contained: imports `motion`, declares its own animation phases via
`useEffect` + `setTimeout` chains, returns a single `motion.div` root.

## Design tokens

Defined in `src/index.css`. Pulled from the project's [DESIGN.md](../DESIGN.md). Highlights:

- `--background: #161616` (true dark, not gray)
- `--accent: #a78bfa` (Obsidian-purple, lifted for dark surfaces)
- `--accent-secondary: #c2553d` (terracotta, for synthesis-content treatment)
- Inter for UI, JetBrains Mono for metadata
- Motion: 120-200ms with `cubic-bezier(0.16, 1, 0.3, 1)` easing

## Customizing

To add a new slide:

1. Create `src/components/slides/MySlide.tsx` exporting a `MySlide` function that takes
   `SlideProps`
2. Import and add to the `SLIDES` array in `App.tsx`
3. The step indicator and keyboard navigation automatically pick it up

To change the palette, edit the `:root` block in `src/index.css`. All slides reference CSS
variables so a single edit propagates.

## Deploy

GitHub Pages auto-deploys from `main` branch via `.github/workflows/deploy-pages.yml`.
Pushes that touch `presentation/**` trigger a rebuild. The workflow uses Node 20 and the
official Pages actions.

To enable on your fork:

1. Settings -> Pages -> Source: **GitHub Actions**
2. Push any change to `presentation/` (or trigger the workflow manually)
3. Live URL appears in the workflow run output: `https://<your-user>.github.io/<repo>/`

## License

TBD by the repo owner.
