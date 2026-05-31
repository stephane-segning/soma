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

   **Density override (`.list-dense`).** daisy's `.list-row` defaults
   to `padding: 1rem` and `gap: 1rem`, which lands at ~56-60 px row
   height — appropriate for marketing surfaces, not for sidebars / file
   browsers / panel contents. Always pair `.list` with our
   `.list-dense` modifier (defined in `styles.css`) on dense surfaces;
   it tightens the row padding to ~5×10 px and drops the per-row
   corner-rounding. `DenseRow` documents this requirement in its
   header; `BotList` applies it automatically.

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

7. **Side panels: chip-bar lives in main, rail is a pure panel stack.**
   The collapsed-panel switcher (`PanelChipBar`) goes into
   `DesktopShell`'s `mainTopLeft` / `mainTopRight` slots — *not*
   inside the rail. When the rail beside it opens, `<main>` shrinks
   and the chip bar rides along automatically. The rail itself is
   only ever a `PanelContainer` filtered by `expandedIds`. The two
   pieces of state — "what's in the bar" and "what's in the rail" —
   are derived from the same `expandedIds: Set<string>` the caller
   owns. See the [Side panels](#side-panels-chip-bar-rail-composition)
   section for the full wiring.

### Primitives catalog

Quick reference for the reusable bits in `@soma/ui`. Click into the
source for the full prop surface.

| Primitive | Where | One-liner |
| --- | --- | --- |
| `Kbd` | [`components/primitives/kbd.tsx`](../../../desktop/desktop-ui/src/components/primitives/kbd.tsx) | daisyUI `<kbd class="kbd">` with size variants + chord helper. Accepts string / array / ReactNode. |
| `Pill` | [`components/primitives/pill.tsx`](../../../desktop/desktop-ui/src/components/primitives/pill.tsx) | daisyUI `.badge badge-soft` + optional dot (`true` / `"pulse"`) for status chips. |
| `MenuShell` / `MenuItem` / `MenuSectionLabel` | [`components/overlays/menu-shell.tsx`](../../../desktop/desktop-ui/src/components/overlays/menu-shell.tsx) | Shared shell for popover menus (slash, context, AI bar action list, add-block menu). Rows snap on hover — no transition. |
| `DenseRow` | [`components/lists/dense-row.tsx`](../../../desktop/desktop-ui/src/components/lists/dense-row.tsx) | daisy `<li class="list-row">` with named slots (`leading` / `primary` + `sub` / `status` / `meta` / `actions`). Must be inside `<ul class="list list-dense">` — without `list-dense` the row picks up daisy's airy 1 rem padding and stops looking dense. |
| `Panel` | [`components/panels/panel.tsx`](../../../desktop/desktop-ui/src/components/panels/panel.tsx) | A single floating-card panel (header + body + footer). Header carries the `−` collapse button (sends the panel back to its `PanelChipBar`) and the `×` close button. |
| `PanelStack` | [`components/panels/panel-stack.tsx`](../../../desktop/desktop-ui/src/components/panels/panel-stack.tsx) | Vertical full-width stack of `Panel`s with `p-2 gap-2`. Returns `null` if empty. |
| `PanelChip` / `PanelChipBar` | [`components/panels/panel-chip-bar.tsx`](../../../desktop/desktop-ui/src/components/panels/panel-chip-bar.tsx) | Floating switcher in main's top-corner. **No card chrome** — only a `backdrop-blur-md` clipped to a rounded shape, no border or shadow or opaque fill. Renders one icon per **collapsed** panel; clicking expands the panel into the rail (the chip then disappears). Goes into `<DesktopShell mainTopLeft={…}>` / `mainTopRight={…}` slots. |
| `PanelContainer` | [`components/panels/panel-container.tsx`](../../../desktop/desktop-ui/src/components/panels/panel-container.tsx) | Thin composition over `PanelStack`. Filters the panel inventory by `expandedIds` and renders the visible ones at 100 % rail width. **No** chip strip, **no** multi-column, **no** horizontal scroll. Callers leave the matching rail's `content` prop `null` when nothing is expanded so the rail unmounts. |
| `BackendSwitcher` | [`components/chat/backend-switcher.tsx`](../../../desktop/desktop-ui/src/components/chat/backend-switcher.tsx) | Full `@floating-ui/react` dropdown for picking the active ACP backend in the composer. Replaces the deleted `AiModelSelector`. |
| `BotList` | [`components/lists/bot-list.tsx`](../../../desktop/desktop-ui/src/components/lists/bot-list.tsx) | `<ul class="list bg-base-100">` of `DenseRow`s, one per bot, with `FailureRow` as a sibling `<li>` for failed bots. |
| `SelectionBubble` / `SelectionAIBar` | [`components/editor/`](../../../desktop/desktop-ui/src/components/editor/) | Floating editor toolbars. SelectionAIBar dismisses on Escape + click-outside (caught a stale-popup bug). |

### Flagship preview

`Desktop / Shell → Soma App` in Storybook composes every primitive in
the library into the shape of the real renderer: header with backend
switcher and `Kbd` quick-open hint, two `PanelChipBar`s (top-left:
Pages + Outline; top-right: Chat / Bots / Page history / Agenda),
two `PanelContainer`s (one per rail, mounted only when their
`expandedIds` set is non-empty), and a Tiptap-style editor mock in
main. Treat that story as the visual-regression canary for the whole
shell — if something looks off there it's almost always off in the
actual renderer too.

### Side panels: chip-bar + rail composition {#side-panels-chip-bar-rail-composition}

The side-panel system is built from four cooperating primitives that
share **one** piece of state (`expandedIds: Set<string>` per side).
The split is the contract you have to understand before touching
anything in `components/panels/` or `components/layout/`.

#### Mental model

- **`PanelChipBar`** is a floating switcher pinned to the top-left or
  top-right corner of `<main>`. It renders one icon per **collapsed**
  panel — never one per expanded panel. Clicking a chip calls
  `onExpand(id)`; the caller adds the id to its `expandedIds` set;
  on the next render the chip vanishes (because it's no longer
  collapsed) and the matching panel appears in the rail.
- **`PanelContainer`** is the rail-side host. It takes the full
  inventory plus the same `expandedIds` set, filters the inventory
  to the expanded subset, and stacks those panels at 100 % rail
  width via `PanelStack`. Returns `null` when nothing is expanded.
- **`Panel`** is the rounded floating card. Its header has a
  `−` button which fires `onCollapse(id)` — the caller removes the
  id from `expandedIds`; on the next render the panel disappears
  from the rail and the chip reappears in the bar.
- **`ShellPanel`** (the rail wrapper inside `DesktopShell`) returns
  `null` when its `content` prop is `null`. So when every panel on
  a side is collapsed, the caller passes `null` as the rail's column
  and the rail unmounts entirely; width returns to 0; persisted
  width is restored on the next mount.

The reason the bar lives in main, not in the rail, is exactly so the
rail can unmount. Coupling the bar to the rail was the root cause of
the "right rail can't auto-shrink" bug — the rail had to stay open
just to host the bar.

#### Canonical wiring

```tsx
// Build-time panel inventories. Move a panel L↔R by shifting it
// between these two arrays — that's the only "configuration" needed.
const LEFT_PANELS: PanelDescriptor[]  = [pagesPanel, outlinePanel];
const RIGHT_PANELS: PanelDescriptor[] = [chatPanel, botsPanel, historyPanel, agendaPanel];

function Workspace() {
  // One Set per side, owned by the app. Both PanelChipBar and
  // PanelContainer read from this — that's how the two stay in sync.
  const [leftExpanded,  setLeftExpanded]  = useState<Set<string>>(new Set(["pages"]));
  const [rightExpanded, setRightExpanded] = useState<Set<string>>(new Set(["chat"]));

  const expand   = (set: Set<string>, id: string) => new Set(set).add(id);
  const collapse = (set: Set<string>, id: string) => { const n = new Set(set); n.delete(id); return n; };

  return (
    <DesktopShell
      mainTopLeft={
        <PanelChipBar
          panels={LEFT_PANELS}
          expandedIds={leftExpanded}
          onExpand={(id) => setLeftExpanded((p) => expand(p, id))}
          placement="top-left"
        />
      }
      mainTopRight={
        <PanelChipBar
          panels={RIGHT_PANELS}
          expandedIds={rightExpanded}
          onExpand={(id) => setRightExpanded((p) => expand(p, id))}
          placement="top-right"
        />
      }
      // `null` when no panels expanded → rail unmounts → width returns
      // to 0 → next mount restores persisted width.
      leftColumn={
        leftExpanded.size > 0 ? (
          <PanelContainer
            panels={LEFT_PANELS}
            expandedIds={leftExpanded}
            onCollapse={(id) => setLeftExpanded((p) => collapse(p, id))}
          />
        ) : null
      }
      rightColumn={
        rightExpanded.size > 0 ? (
          <PanelContainer
            panels={RIGHT_PANELS}
            expandedIds={rightExpanded}
            onCollapse={(id) => setRightExpanded((p) => collapse(p, id))}
          />
        ) : null
      }
    >
      <Editor />
    </DesktopShell>
  );
}
```

#### Build-time left/right placement

There is **no runtime drag-and-drop** between rails and **no
per-panel `side` prop**. The side a panel lives on is whichever array
(`LEFT_PANELS` vs `RIGHT_PANELS`) the developer puts the descriptor
in. To move a panel L→R, shift one line of code. This keeps panel
identity / state colocated with the array it belongs to and avoids a
class of state-loss bugs that drag-and-drop reordering would
introduce.

#### Resize bounds (lightly-resizable left, freer right)

`DesktopShell` exposes per-side `{left,right}{Min,Max}Width` props
with defaults that match the typical content density of each side:

| Side  | Default min | Default max | Rationale |
| ----- | ----------- | ----------- | --------- |
| Left  | 200 px      | 320 px      | Pages / outlines / nav are dense enough that more width adds little. |
| Right | 280 px      | 720 px      | Chat / inspector / tools want more room for messages and forms. |

The `ResizeHandle` is invisible at rest; it only paints a 2 × 40 px
primary-tinted pill on hover (opacity-fades in, no transform) and
solidifies on active drag. There is **no border-l / border-r** on
either rail — the only visible separator is that hover pill. This is
the explicit fix for the "static hairline cuts through floating-card
gutters" complaint that triggered the chip-bar rewrite.

#### When to bypass `PanelContainer`

`PanelStack` (the vertical full-width Panel column) is exported on
its own for stories or surfaces that just want the stack without the
`expandedIds` filter. Likewise `Panel` is usable in isolation if you
need a single floating card with no rail-side logic. The composition
hierarchy is intentionally:

```
Panel  ⊂  PanelStack  ⊂  PanelContainer
```

— each layer adds one concern. Don't reach below the level you need;
don't reach above it either.

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

#### Side-panel chip strip coupled to the rail — rail can't auto-shrink

The first cut of `PanelContainer` hosted both the expanded panels
*and* the strip of collapsed icons inside the rail. That couples two
concerns: as long as the strip exists, the rail can't unmount, so the
rail's width never drops below the strip's width. Users called this
out as "right rail floating + too wide when nothing's expanded" — the
rail visibly took ~32-40 px of horizontal space just to show the
collapsed-icon column.

The fix is structural, not cosmetic: move the chip strip out of the
rail entirely. `PanelChipBar` lives in `<main>`'s top corners via
`DesktopShell.mainTopLeft` / `mainTopRight`; the rail becomes a pure
`PanelContainer` that returns `null` when `expandedIds` is empty,
which lets `ShellPanel` unmount and reclaim the width. The two
components share one `expandedIds: Set<string>` so they stay in sync.

The general rule: if a "container" component hosts two pieces of UI
where one needs to disappear and the other doesn't, those need to be
separate components rendered by separate slots — not a single
component with internal modes.

#### Always-visible resize divider breaks the floating-card aesthetic

Before the chip-bar rewrite, `ResizeHandle` painted a 1 px
`bg-base-300` hairline at all times, which read fine on flush
sidebars but looked like a stray line cutting through the gutter
once the rail switched to floating-card chrome. The fix: the handle
paints **nothing** at rest. A 2 × 40 px primary-tinted pill
opacity-fades in only on hover, and solidifies on active drag. No
transform anywhere on the handle — opacity only — so the affordance
can't be confused with a hover-zoom.

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

### Grapheme-Aware Typing (Tapia typing practice)

- `useGraphemes(value: string)` splits text into grapheme clusters using `Intl.Segmenter` (fallback to `Array.from`).
- `CharDisplay` is a dumb renderer that expects `shouldGraphemes` and `isGraphemes`. It aligns glyphs (including emojis) and shows mismatches with an elevated correct glyph.

### Desktop Layout

`DesktopShell` is the full-screen wrapper. Its prop surface, top to
bottom:

| Slot / prop | Renders where |
| --- | --- |
| `header` (render-prop) | Above the body. Receives `{ toggleLeft, toggleRight, leftOpen, rightOpen, hasLeft, hasRight }` so the app owns its toolbar. |
| `leftColumn` / `rightColumn` | Hosted in `ShellPanel`. Returns `null` (unmounts the rail, width 0) when its column prop is `null`. |
| `mainTopLeft` / `mainTopRight` | Absolutely positioned inside `<main>` at `top:8 left/right:8`. Designed for `PanelChipBar` — when the rail beside it opens, main shrinks and the slot rides along. |
| `children` | The main column. `overflow-auto max-h-full`, so long content scrolls while rails stay fixed. |
| `footer` | Below the body. |
| `overlays` | A `pointer-events-none absolute inset-0 z-20` layer for global modals / drag previews. |

Per-side configuration props:

| Prop | Default |
| --- | --- |
| `initialLeftWidth` / `initialRightWidth` | 240 px / 320 px (overridable) |
| `leftMinWidth` / `leftMaxWidth` | 200 / 320 (lightly resizable — pages / outlines don't gain from wider widths) |
| `rightMinWidth` / `rightMaxWidth` | 280 / 720 (chat / inspector want more room) |
| `onLeftResizeStop` / `onRightResizeStop` | Fired on drag end with the clamped width — wire to a persistence layer or to `useState` |
| `storageKey` | When set, widths + open/closed state persist to `localStorage` via the built-in storage helper |

For everything panel-related — `PanelChipBar` placement, the
`expandedIds` contract, the rail unmount/remount logic, the
`Panel ⊂ PanelStack ⊂ PanelContainer` composition — see the
[Side panels](#side-panels-chip-bar-rail-composition) section above.
The `Desktop / Shell → Soma App` Storybook scene is the visual
regression canary for any chrome-level change.

### Window drag regions (Tauri)

- The Tauri app uses a frameless window (`decorations: false`, `titleBarStyle: "Overlay"`, `hiddenTitle: true` in `tauri.conf.json`). Mark draggable chrome with `data-drag-region` and opt interactive elements out with `data-no-drag`.

### Build + publishing

- Build locally: `pnpm --filter @soma/ui run storybook` (dev) or `pnpm --filter @soma/ui run build:storybook`.
- Docs pipeline: `just docs-build` also builds Storybook into `site/storybook` after VitePress runs.
