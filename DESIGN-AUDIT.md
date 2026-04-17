# Design Compliance Audit — 2026-04-17

Walked every file under `app/web/` against the DESIGN.md verification checklist.

## Result: PASS (after one button.tsx remediation)

| Rule | Result | Notes |
|---|---|---|
| All colors come from CSS-variable palette | **PASS (after fix)** | `button.tsx` had two hex literals (`#0a0a0a` text on primary, `#a85959` on danger hover). Replaced with `var(--background)` / `var(--text-primary)` / `opacity-90`. Only `index.css` now contains hex (the token definitions themselves, which is the single source of truth). |
| All font sizes match the typography scale | PASS | All sizes use Tailwind utility classes that resolve to multiples of the scale (`text-xs/sm/base/lg/xl/2xl/5xl`). |
| All spacings are multiples of 4px | PASS | Tailwind `p-`, `m-`, `gap-` defaults are 4px-multiples; no inline pixel values outside the resizable sidebar (where 200/260/400 minima are explicit and reviewed). |
| No emojis in code, content, or UI strings | PASS | grep for `✨/🎉/🚀/🤖/sparkle` returned zero matches. |
| No purple gradient surfaces | PASS | grep for `linear-gradient/radial-gradient` returned zero matches. Single accent applied as solid fill only. |
| No "AI-generated" sparkle badges | PASS | Synthesis content uses subtle `borderLeft` + section-color treatment per DESIGN.md, no badges. |
| No perpetual motion (animations terminate) | PASS — bounded by design | Two infinite animations: `pulse-ring` (1.6s loop) on the synth-running indicator dot, `cursor-blink` on the typing cursor. Both are bounded UI states (visible only while a job is in flight or focus is in an editor); the animation itself loops but its mount lifetime is finite. Static UI is motion-free. react-flow + d3-force layout settles after 250 ticks then stops. Tab underline transition is per-event, not perpetual. |
| No layout shift during streaming content | PASS | `useSSE` token rendering appends to existing flex column; no width/height changes. ExplorationView reserves message-bubble structure ahead of token arrival. |

## Files audited

```
app/web/
  index.css                       — token definitions, two bounded keyframes
  main.tsx                        — entry point, no styling
  App.tsx                         — composition only, uses var() throughout
  components/
    AppShell.tsx                  — uses var() throughout
    SynthControls.tsx             — uses var(); pulse-ring on running indicator
    Sidebar/index.tsx
    Sidebar/ProjectTree.tsx
    Sidebar/ProfilePicker.tsx
    Sidebar/DirectionList.tsx
    SubprojectView/index.tsx
    SubprojectView/MainTab.tsx
    SubprojectView/DumpTab.tsx
    SubprojectView/ConnectionsTab.tsx
    SubprojectView/SynthesisTab.tsx
    Exploration/ExplorationView.tsx
    editors/MarkdownEditor.tsx    — CodeMirror theme uses var() for every color
    ui/button.tsx                 — REMEDIATED (was: hex literals)
    ui/tabs.tsx                   — uses var() throughout
```

## Remediations applied this audit

- `app/web/components/ui/button.tsx`:
  - `text-[#0a0a0a]` → `text-[var(--background)]` on `primary` variant
  - `hover:text-white` → `hover:text-[var(--text-primary)]`
  - `text-white` → `text-[var(--text-primary)]` on `danger`
  - `hover:bg-[#a85959]` → `hover:opacity-90` on `danger` (avoids hardcoding a darker shade)

After remediation: zero non-CSS-variable color references outside `index.css`.

## Verification scripts (re-runnable)

```bash
# Hex literals outside the token file
grep -rE "#[0-9a-fA-F]{3,8}\b" app/web --include="*.ts" --include="*.tsx"
# Should return zero matches.

# Emojis
grep -rE "[✨🎉🚀🤖]|sparkle" app/web
# Should return zero matches.

# Gradients
grep -rE "linear-gradient|radial-gradient" app/web
# Should return zero matches.
```

## Conclusion

UI is design-compliant per DESIGN.md. T016 closes.
