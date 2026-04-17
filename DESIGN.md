# Teambrain Design System

Single source of truth for visual decisions. Forge UI tasks read this; the friend's
implementation reads this; reviews check against this. Update here, not in code.

## Aesthetic direction

Obsidian-inspired but its own thing. Three reference points:

- **Obsidian** — typographic restraint, IDE-feel three-pane, true dark mode discipline
- **Linear** — motion precision, single-accent restraint, subtle pulse states
- **NotebookLM** — every synthesized claim hover-traceable to a source citation

What we are NOT: generic AI app aesthetic (purple gradients + glass cards + sparkle icons),
Notion clone, decorative-graph-view-everywhere. No emojis anywhere.

## Color tokens

CSS custom properties, dark mode primary (light mode is post-POC).

```css
:root {
  /* Surfaces */
  --background: #161616;
  --surface: #1c1c1c;
  --surface-elevated: #232323;
  --surface-overlay: #2a2a2a;

  /* Borders */
  --border: #2d2d2d;
  --border-light: #3a3a3a;

  /* Text */
  --text-primary: #e8e8e8;
  --text-secondary: #a8a8a8;
  --text-muted: #6e6e6e;

  /* Primary accent — Obsidian-purple, lifted for dark surface */
  --accent: #a78bfa;
  --accent-strong: #8b5cf6;
  --accent-tint: #1e1832;

  /* Secondary accent — terracotta, used for synthesis-content treatment */
  --accent-secondary: #c2553d;
  --accent-secondary-tint: #2a1410;

  /* Semantic */
  --agreement: #6a9b7a;
  --contradiction: #c66b6b;
  --info: #6a8db8;
  --warning: #d4a76a;
}
```

Rules:
- Primary accent (purple) for navigation state, focus rings, primary actions
- Secondary accent (terracotta) for synthesis-content surface treatment (left border on
  synthesized blocks, "Move forward" section header)
- Never combine purple + terracotta gradients
- Never use a pure black background; `#161616` is the floor
- Never use `#2a2a2a` and call it dark mode

## Typography

```css
:root {
  --font-ui: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", Consolas, Monaco, monospace;
}
```

Scale:

| Use | Font | Size | Weight | Color |
|---|---|---|---|---|
| Display heading (slide titles, section H1) | Inter | 48-72px | 600 | text-primary |
| H2 | Inter | 24-32px | 600 | text-primary |
| H3 / card title | Inter | 16-18px | 600 | text-primary |
| Body | Inter | 14-15px | 400 | text-secondary |
| UI control | Inter | 13-14px | 500 | text-secondary |
| Label / eyebrow | Inter | 10-11px | 600, uppercase, letter-spacing 0.08em | text-muted |
| Code / metadata | JetBrains Mono | 11-13px | 400-500 | text-secondary |

Line-height: 1.5-1.6 for body, 1.2-1.3 for headings.

## Layout

- **App shell**: three-pane (sidebar 260px, main fluid, bottom bar 48px)
- **Sidebar**: project tree, profile picker pinned bottom-left
- **Subproject view**: tab bar (4 tabs) above content pane
- **Content pane padding**: 24px desktop, 16px tablet
- **Card spacing**: 16px gap between cards in a grid; 12px inside a card

## Component tokens

### Cards

- Background: `--surface`
- Border: 1px solid `--border`
- Radius: 12px
- Padding: 16-24px depending on density
- Hover: border color shifts to `--border-light` (no scale, no shadow change)

### Buttons

- Primary: `--accent` background, `#fff` text, radius 8px, padding 6-12px / 12-20px
- Secondary: transparent, `--border-light` border, `--text-secondary` text
- Icon-only: 36px square, transparent, hover bg `--surface-elevated`
- Disabled: 50% opacity, no hover state

### Tabs

- Inactive: `--text-muted`, regular weight, hover -> `--text-secondary`
- Active: `--text-primary`, semibold, 2px purple underline
- Underline animates with motion `layoutId` between tabs

### Inputs / editor

- Background: `--background` (recessed below `--surface`)
- Border: 1px solid `--border`
- Focus: 1.5px solid `--accent` + `--accent-tint` glow
- Padding: 8-12px
- Code font for code blocks; UI font for prose

## Synthesis content treatment

Distinguishes AI-synthesized output from human-authored content without a "this was AI"
badge.

- **Synthesis blocks**: left border 3px `--accent-secondary`, background subtly tinted
  with 1% lighter than surface
- **Citation chips**: inline `[Author, dump-id]` rendered as pill with `--surface-overlay`
  background, hover reveals tooltip with verbatim source quote
- **Author chips**: stacked avatar circles (Slack-style), 20px diameter, single-letter
  initial, color from profile palette
- **Agreement bar**: stacked horizontal bar `[3 agree | 1 mixed | 1 dissent]`, low
  saturation, 6px height
- **Synthesis trust mark**: terracotta-tinted footer per section showing generation time and
  source dump count

What we never do:
- "AI-generated" badges with sparkle icons
- Purple gradients on synthesis blocks
- Typewriter animation on already-computed content
- Floating action button with sparkle

## Motion

```css
--easing-default: cubic-bezier(0.16, 1, 0.3, 1);
--easing-spring: spring(380, 30);

--duration-micro: 120ms;
--duration-default: 200ms;
--duration-page: 320ms;
```

Rules:
- All transitions use `--easing-default`
- Tab underlines use spring (Linear-style)
- No perpetual animation — pulse rings stop after 5 cycles
- Graph nodes settle once and stop (no perpetual jitter)
- Hover states are opacity / border color changes, never scale or glow

## Knowledge graph styling

- **Nodes**: circles, no labels at zoom < 1.0, label visible at zoom >= 1.0 or on hover
- **Node size**: `20 + (contributing_dump_count * 4)` px radius, capped at 60px
- **Node color**: by `type` token (theme=info, claim=accent, concern=warning,
  deliverable=accent-secondary)
- **Node fill**: `--surface-elevated` (not solid color); border color carries the type signal
- **Edges**:
  - Agreement: `--agreement`, solid, 1.5px
  - Contradiction: `--contradiction`, dashed `4 3`, 2px
  - Related: `--border-light`, solid, 1px
- **Visible cap**: 40 nodes; rest cluster into "+N more" bubbles
- **Background**: subtle dotted grid, 24px spacing, 2% white opacity dots

## Voice and microcopy

- Plain, professional, no marketing language
- Never use exclamation marks
- Never use "let's", "let me", "I'll"
- Action labels are imperative verbs: "Save dump", "Re-synthesize", "New direction"
- Empty states are short and useful: "Speak your mind. This stays private." not "No dumps yet!
  Click here to create your first dump and start your journey."
- Error messages name what failed and what to try: "Ollama not reachable at
  http://127.0.0.1:11434. Run: `ollama serve`" not "An error occurred. Please try again."

## Iconography

- Stroke-based, 1.5-2px weight
- Lucide icon set as the default
- 16px in tight UI, 20px in standalone, 24px+ for empty states
- Never decorative emoji
- Custom logos / illustrations: same stroke weight as icons

## Density modes (post-POC)

Not in POC. Eventually three modes:
- Default: 14px body, 24px paddings
- Compact: 13px body, 16px paddings
- Cozy: 15px body, 32px paddings

For POC, ship the Default density.

## Implementation notes

- Tailwind v4 with CSS-variable arbitrary values: `bg-[var(--surface)]`, `text-[var(--text-primary)]`
- shadcn/ui primitives (Button, Tabs, Dialog, DropdownMenu) themed via these CSS vars
- Motion library: `motion` (the new name for Framer Motion)
- Graph: `react-flow` + `d3-force` plugin
- Icons: `lucide-react`
- Editor: `@codemirror/lang-markdown` with the Obsidian-style theme
- Fonts loaded from Google Fonts in `index.html`

## Verification (used by Forge review pass)

A UI task is design-compliant if:
- [ ] All colors come from the CSS-variable palette (no hex literals in components)
- [ ] All font sizes match the typography scale
- [ ] All spacings are multiples of 4px
- [ ] No emojis in code, content, or UI strings
- [ ] No purple gradient surfaces
- [ ] No "AI-generated" sparkle badges
- [ ] No perpetual motion (animations terminate)
- [ ] No layout shift during streaming content
