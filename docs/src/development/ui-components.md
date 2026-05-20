## UI Components and Storybook

`@soma/ui` is the shared component package — see [docs/src/architecture/prd/ui-revamp-v0-scaffold.md](../architecture/prd/ui-revamp-v0-scaffold.md) for the build plan and [ADR-0005](../architecture/adrs/0005-ui-revamp-v0.md) for the locked architecture.

### Foundation (Wave 0)

The token sweep + foundation primitives ship before any component work. Every new component depends on them.

#### Design tokens (rem-based, accessibility-aware)

Defined in [`@soma/ui` styles.css](../../../desktop/desktop-ui/src/styles.css):

- **Font sizes**: Use Tailwind's native `text-sm` (14px) for body + dense UI rows and `text-xs` (12px) for caps / hint text. The earlier `text-body / text-ui-sm / text-ui-xs` custom tokens were removed — they targeted exact 14 / 13 / 11px sizes from a density audit, but tailwind-merge silently dropped them when combined with `text-{color}` classes (the active-row "zoom on hover" bug). The 1px bumps on the densest surfaces are acceptable in exchange for the simpler model.
- **Row height tiers**: `row-text` (2rem / 32px — text-only / icon-leading), `row-avatar` (2.5rem / 40px — avatar-leading rows), `row-card` (3.25rem / 52px — two-line content). `row-text` does **not** fit a 40px avatar — use `row-avatar` in that case.
- **Single shadow token**: `--shadow-elevated` is the only allowed box-shadow, reserved for modal + popup window surfaces. **Shadows are off by default everywhere** — surfaces opt in via the `shadow-elevated` class.
- **Surface utilities**: `surface-card` (border-only resting surface), `glass-panel` (translucent + backdrop blur, **no shadow**). Floating overlays that genuinely need depth (modal, command-palette, bubble-toolbar, context-menu, toast) add `shadow-elevated` explicitly. The `*-legacy` variants preserve pre-revamp depth and are deleted after cutover completes — see the scaffold doc §5.

#### `DensityProvider` ([primitives/density-provider.tsx](../../../desktop/desktop-ui/src/components/primitives/density-provider.tsx))

React context exposing `'dense' | 'cozy' | 'oversized'`. v0 ships dense; cozy and oversized are post-v0 config flips. Read via `useDensity()` or `useDensityValue({...})`.

#### i18n harness ([i18n/](../../../desktop/desktop-ui/src/i18n/))

`@soma/ui` ships an English-only catalog at v0; the harness exists so adding locales later is config, not refactor. Every user-facing string in new components must route through this — see Acceptance §4.7 in the scaffold.

```tsx
import { useT } from "@soma/ui/i18n/use-t";

const t = useT();
return (
  <button>
    {t({
      id: "bot-list.add",
      defaultMessage: "Add bot",
    })}
  </button>
);
```

ICU placeholders work: `{count, plural, one {} other {}}`, `{name}`, etc. The `defaultMessage` is the source of truth at v0; a future extractor harvests `id` + `defaultMessage` into per-locale catalogs.

### Storybook conventions

Stories live at `desktop/desktop-ui/src/stories/<component>.stories.tsx`. Run locally:

```bash
pnpm --filter @soma/ui run storybook
```

Every new component must ship with a story exercising the full state matrix:

- **default** (resting)
- **hover**
- **focus-visible** (keyboard focus)
- **disabled** (where applicable)
- **empty** (where applicable — use the [`Empty` primitive](../../../desktop/desktop-ui/src/components/primitives) variant matching the surface)
- **error** (where applicable — inline error rendering, never toast-only; see [ADR-0005 §6](../architecture/adrs/0005-ui-revamp-v0.md))
- **dark theme** — set `parameters: { theme: 'luxury' }` on a story for explicit dark coverage.

For list rows / popovers / menus, also: **keyboard navigation** (arrow / enter / esc).

Stories are wrapped automatically (in `.storybook/preview.tsx`) with:
- `SomaIntlProvider` — `useT()` resolves inside any story
- `DensityProvider` — defaults to `dense`; override per story with `parameters: { density: 'cozy' }`
- A `data-theme` decorator that sets DaisyUI's theme (`cmyk` default)
- A memory router

There is **no hardcoded canvas background** — `bg-base-100` (theme-driven) carries the surface. Stories that need a different canvas declare it via `parameters`.

### Conventions (locked after the editor-polish PR cycle)

Every new component should follow these rules. They came out of a long
testing loop (see the Pitfalls section below) and exist to keep the
visual language coherent.

1. **Lean on daisyUI 5 primitives before hand-rolling.** Before
   adding a flex/grid layout, check whether daisyUI ships the shape
   already (`.btn`, `.badge`, `.list`, `.list-row`, `.kbd`,
   `.dropdown`, `.menu`, `.select`, `.input`, `.loading`,
   `.status`). The reference is daisyUI's [llms.txt](https://daisyui.com/llms.txt).
   We migrated Pill → `.badge .badge-soft`, the code-block language
   picker → `.select select-ghost`, DenseRow → `.list-row`, BotList
   wrapper → `<ul class="list">`. Three migrations we *considered* and
   rejected (with a comment in the source explaining why): MenuShell
   → daisy `.menu` (would re-introduce a 200ms transition on every
   row); DenseRow's grid → daisy positional `list-row` columns (our
   API is named-slot, daisy's is positional — only the surface
   migrates).

2. **Tailwind utilities only — no custom `text-*` tokens.** We
   removed `text-body / text-ui-sm / text-ui-xs`. Use `text-sm` for
   body + dense rows, `text-xs` for caps / hint text. Adding custom
   font-size tokens means teaching `tailwind-merge` about them or
   eating the silent-drop bug described in Pitfalls.

3. **Row-list highlights snap.** Never `transition-colors` on a
   row primitive's background. The 150 ms colour fade reads as the
   row "growing into place" as the mouse moves across the list
   (the symptom users repeatedly reported as "zoom on hover"). Snap
   active/hover background changes — the cursor motion supplies the
   feedback.

4. **No `scale: 0.96 → 1` entry animations on popovers.** A pop-in
   scale of even 4 % looks identical to a hover-zoom when the
   popover appears as a hover/selection consequence. Slash menu,
   action menu, format bubble, command palette, window-chrome
   buttons — all dropped during the polish pass. Keep `opacity` /
   `y` / `x` transitions where you need a fade in.

5. **Daisy classes for keyboard shortcuts.** Render every keyboard
   key through the `Kbd` primitive (which wraps `<kbd class="kbd">`).
   It accepts a single key, an array, or a string that auto-splits
   (graphemes for `"⌘⇧F"`, `+`-split for `"Ctrl+Shift+Del"`). The
   chord shape uses bare `+` text nodes between sibling `<kbd>`s —
   the exact shape from daisy's docs.

6. **Compose, don't fight, the `cn()` helper.** Our `utils/cn.ts`
   pipes through `tailwind-merge`. Don't introduce custom utilities
   that look like Tailwind's grouped classes (e.g. anything named
   `text-*`, `bg-*`, `border-*`) without registering them in the
   `extendTailwindMerge` config — twMerge will silently drop one of
   them on conflict.

### Primitives catalog

Quick reference for the reusable bits in `@soma/ui`. Click into the
source for the full prop surface.

| Primitive | Where | One-liner |
| --- | --- | --- |
| `Kbd` | [`components/primitives/kbd.tsx`](../../../desktop/desktop-ui/src/components/primitives/kbd.tsx) | daisyUI `<kbd class="kbd">` with size variants + chord helper. Accepts string / array / ReactNode. |
| `Pill` | [`components/primitives/pill.tsx`](../../../desktop/desktop-ui/src/components/primitives/pill.tsx) | daisyUI `.badge badge-soft` + optional dot (`true` / `"pulse"`) for status chips. |
| `MenuShell` / `MenuItem` / `MenuSectionLabel` | [`components/overlays/menu-shell.tsx`](../../../desktop/desktop-ui/src/components/overlays/menu-shell.tsx) | Shared shell for popover menus (slash, context, AI bar action list, add-block menu). Rows snap on hover — no transition. |
| `DenseRow` | [`components/lists/dense-row.tsx`](../../../desktop/desktop-ui/src/components/lists/dense-row.tsx) | daisy `<li class="list-row">` with named slots (`leading` / `primary` + `sub` / `status` / `meta` / `actions`). Must be inside `<ul class="list">`. |
| `PanelContainer` | [`components/panels/panel-container.tsx`](../../../desktop/desktop-ui/src/components/panels/panel-container.tsx) | Stable-position 2-column layout: odd-index panels → col 1, even → col 2. Each column = fixed `w-80`. Collapsed icons in the right rail. |
| `BackendSwitcher` | [`components/chat/backend-switcher.tsx`](../../../desktop/desktop-ui/src/components/chat/backend-switcher.tsx) | Full `@floating-ui/react` dropdown for picking the active ACP backend in the composer. Replaces the deleted `AiModelSelector`. |
| `BotList` | [`components/lists/bot-list.tsx`](../../../desktop/desktop-ui/src/components/lists/bot-list.tsx) | `<ul class="list bg-base-100">` of `DenseRow`s, one per bot, with `FailureRow` as a sibling `<li>` for failed bots. |
| `SelectionBubble` / `SelectionAIBar` | [`components/editor/`](../../../desktop/desktop-ui/src/components/editor/) | Floating editor toolbars. SelectionAIBar dismisses on Escape + click-outside (caught a stale-popup bug). |

### Flagship preview

`Desktop / Shell → Soma App` in Storybook composes every primitive in
the library into the shape of the real renderer: header with the
backend switcher and `Kbd` quick-open hint, daisy-`list` pages
sidebar, editor-mock document with inline `Kbd` chords + code block,
and a `PanelContainer` on the right with Chat / Bots / Page history /
Agenda. Treat that story as the visual-regression canary for the
whole shell — if something looks off there it's almost always off in
the actual renderer too.

### Pitfalls (the bugs that cost us multiple rounds)

Logged here so they don't recur silently.

#### `tailwind-merge` + custom text-size tokens = silent drop

Composing a custom font-size class with a colour class through `cn()`
silently dropped the size. tailwind-merge's default config doesn't
know `text-ui-sm` is a font-size, so when it saw
`cn("text-ui-sm", "text-primary")` it grouped both as conflicting
`text-*` tokens and kept only `text-primary`. The active row jumped
from 13 px to the browser default 16 px — the visible "zoom on hover"
the user reported repeatedly. Fix shipped two ways: short-term, an
`extendTailwindMerge` config registering the custom group; long-term,
drop the custom tokens entirely and use Tailwind-native `text-sm` /
`text-xs`. If a new custom utility looks like a Tailwind group prefix
(`text-*`, `bg-*`, `border-*`, …), register it explicitly or expect
silent drops.

#### `transition-colors` on row-list backgrounds reads as zoom

Animating a row's bg-color from transparent → `bg-base-200` over
150 ms made the highlighted row's coloured rectangle visibly fade in,
which the user perceived as the row growing in. Every row-style
list primitive (MenuItem, BackendSwitcher row, CommandPalette row,
MentionPicker, TreePopover, DenseRow) had to be swept. Rule: never
animate the background colour on a row's hover/active state. Snap
instantly.

#### `scale: 0.96 → 1` entry animations on hover-triggered popovers

Even a 4 % scale-in animation reads as a hover-zoom when the popover
opens because the user is hovering. Killed across the action menu,
context menu, command palette, bubble toolbar, quick-action panel,
window-chrome traffic-light buttons. The
[`no-scale-animations.test.ts`](../../../desktop/desktop-ui/src/components/overlays/no-scale-animations.test.ts)
guard pins the rule against re-introduction.

#### DragHandle prop identity stability

`@tiptap/extension-drag-handle-react` puts `onNodeChange`,
`onElementDragStart`, `onElementDragEnd`, and `computePositionConfig`
in a `useEffect` dep list. Passing fresh-identity arrows on every
render unregistered + re-registered the ProseMirror drag-handle
plugin on every mouse move. Plugin re-registration reconfigures the
editor's plugin list, which resets the suggestion plugin's state to
`{ active: false }` — the slash menu vanished as soon as the mouse
moved. Wrap every prop in `useCallback` / `useMemo`. A regression
test in
[`action-menu.test.tsx`](../../../desktop/desktop-editor/src/menus/action-menu.test.tsx)
pins this.

#### `list-row` is a positional grid, not named slots

daisyUI's `.list-row` is `display: grid; grid-auto-flow: column;` —
each child is its own column. If a component has named-conditional
slots (some optional), the positional model fights you. Solutions:
either render placeholders so positions stay stable, or mark the
intended-to-grow column with `list-col-grow`. DenseRow uses the
second approach. Don't try to use `list-row` for a custom slot API
without confronting this first.

#### Stale rect closure on floating-ui virtual element

A `VirtualElement` whose `getBoundingClientRect: () => rect`
closure-captured `rect` once at effect time, then never updated. The
slash menu didn't follow scroll because `autoUpdate` kept reading the
stale DOMRect. Always read the rect *inside* the getter so it
re-evaluates on every floating-ui recompute:

```ts
getBoundingClientRect: () => clientRect() ?? new DOMRect()
```

Pinned by [`command-list-rect.test.ts`](../../../desktop/desktop-editor/src/extensions/commander/command-list-rect.test.ts).

#### daisyUI version drift across extensions

A `@tiptap/extension-highlight` minor bump (3.18 → 3.23) silently
imported a `getStyleProperty` export from `@tiptap/core` that didn't
exist in core 3.18, breaking Storybook's `optimizeDeps`. Pin
extension versions in `~`-range when the rest of the toolkit is at a
locked `^x.y.z`, so only patches flow in until a coordinated bump.

### Chat + Reasoning

- `AiConversation` + `AiMessage` render chat roles (user/assistant/tool/source) with optional thinking blocks.
- `AiThinking` renders a collapsible "Thinking…" section; pass `status="thinking" | "complete"`, `durationLabel`, and `content` (markdown rendered via `AiMarkdown`).
- Keep chat wrappers thin: `AiChat` provides a scroll container; inputs are kept separate.

### Grapheme-Aware Typing (Tapia / `/practice` route)

- `useGraphemes(value: string)` splits text into grapheme clusters using `Intl.Segmenter` (fallback to `Array.from`).
- `CharDisplay` is a dumb renderer that expects `shouldGraphemes` and `isGraphemes`. It aligns glyphs (including emojis) and shows mismatches with an elevated correct glyph.

### Desktop Layout

- `DesktopShell` is a full-screen wrapper with optional left/right sidebars, header/footer slots, and overlay layer.
- Sidebars are resizable via `re-resizable`; pass `initialLeftWidth`/`initialRightWidth` and `onLeftResizeStop`/`onRightResizeStop` to persist widths (see `PersistentWidths` story).
- The main column enforces `overflow-auto` with `max-h-full`, so long content scrolls while sidebars stay fixed.
- Header is a render-prop: receives `toggleLeft`, `toggleRight`, and open state so apps can control toggles (e.g., menu/info buttons).
- The right column is typically a `PanelContainer` — the 2-column stable-position layout for side panels (Chat / Bots / Page history / Agenda / …). Odd-index panels stack in column 1, even-index in column 2; each column independently flex-cols its expanded panels. No cap, no overflow, no auto-evict. Collapsed panels show as icons in a thin right rail.
- The `Desktop / Shell → Soma App` Storybook scene composes the full library — use it as the canary preview for any chrome-level change.

### Window drag regions (Electron)

- Electron (`desktop/soma`): use `data-drag-region` + CSS `-webkit-app-region: drag` (see `desktop/soma/src/renderer/src/styles/app.scss`). Mark interactive elements with `data-no-drag`.

### Build + publishing

- Build locally: `pnpm --filter @soma/ui run storybook` (dev) or `pnpm --filter @soma/ui run build:storybook`.
- Docs pipeline: `just build-docs` also builds Storybook into `site/storybook` after VitePress runs.
