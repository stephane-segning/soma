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

### Window drag regions (Electron)

- Electron (`desktop/soma`): use `data-drag-region` + CSS `-webkit-app-region: drag` (see `desktop/soma/src/renderer/src/styles/app.scss`). Mark interactive elements with `data-no-drag`.

### Build + publishing

- Build locally: `pnpm --filter @soma/ui run storybook` (dev) or `pnpm --filter @soma/ui run build:storybook`.
- Docs pipeline: `just build-docs` also builds Storybook into `site/storybook` after VitePress runs.
