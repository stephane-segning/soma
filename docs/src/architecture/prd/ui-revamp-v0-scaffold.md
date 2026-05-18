# UI Revamp v0 — `@soma/ui` Scaffolding Plan

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md) (PRD), the seven refs docs in this folder, and [ADR-0005](../adrs/0005-ui-revamp-v0.md). This doc turns the PRD §6 component table into a sequenced, dependency-aware build plan: which components are new vs. refactors of existing code, what depends on what, the order in which they ship to `@soma/ui`, and the criteria a component must meet before any `desktop/soma` consumer wires it in.

PRD §7 step 5 is the deliverable; this is the spec for how step 5 runs.

## 1. Pre-flight: the token sweep

Before any component work, the design token system from [ADR-0005 §7](../adrs/0005-ui-revamp-v0.md) and [refs §3](./ui-revamp-v0-refs-files-density.md) lands in [desktop/desktop-ui/src/styles.css](../../../../desktop/desktop-ui/src/styles.css). Concretely:

- **Font sizes.** Add `--text-body: 14px`, `--text-ui-sm: 13px`, `--text-ui-xs: 11px` (or via Tailwind's `@theme`); set DaisyUI / Tailwind base to `--text-body`.
- **Line-heights.** `--leading-body: 1.5`, `--leading-ui: 1.2`. (Bumped from PRD's original 1.45.)
- **Row heights.** Utility classes for 32 / 40 / 52px row tiers.
- **Border + shadow.** Establish exactly one shadow token (`--shadow-elevated`), used by modal + popup only. **Kill the existing `surface-card` and `glass-panel` utilities in styles.css** — both currently use `shadow-xl` / `shadow-2xl`, which directly contradict ADR-0005 §7. Replace with border-only `surface-card`.
- **DaisyUI theme.** Audit `cmyk` (default) and `luxury` for shadow + radius. The default theme should ship with shadow disabled at the component level.

Token sweep is the only PR that needs zero new components — it cleans the foundation so every wave that follows compiles into a consistent visual system.

## 2. Mapping PRD §6 to current `@soma/ui` reality

PRD §6 lists 20 components for v0. Many already exist in `desktop/desktop-ui/src/components/` as starting points. The scaffold work is: refactor where there is precedent, build where there is none.

| PRD §6 component | Existing in `@soma/ui` | Plan |
|---|---|---|
| `PanelContainer` | _none_ | New. `panels/panel-container.tsx`. |
| `Panel` | _none_ | New. `panels/panel.tsx`. |
| `SlashMenu` | _none_ (closest precedent is [`overlays/command-palette.tsx`](../../../../desktop/desktop-ui/src/components/overlays/command-palette.tsx)) | New. `editor/slash-menu.tsx`. |
| `MentionPicker` | _none_ | New. `editor/mention-picker.tsx`. |
| `SelectionBubble` | [`overlays/bubble-toolbar.tsx`](../../../../desktop/desktop-ui/src/components/overlays/bubble-toolbar.tsx) (65 lines) | **Refactor.** Replace internals; rename to `editor/selection-bubble.tsx`. |
| `BotList` | _none_ (closest: [`lists/roster-item.tsx`](../../../../desktop/desktop-ui/src/components/lists/roster-item.tsx)) | New. `lists/bot-list.tsx`. Built on `DenseRow`. |
| `CapabilityForm` | _none_ | New. `forms/capability-form.tsx`. |
| `BackendSwitcher` | [`forms/ai-model-selector.tsx`](../../../../desktop/desktop-ui/src/components/forms/ai-model-selector.tsx) (107 lines) | **Refactor.** Move to `chat/backend-switcher.tsx`; reshape into a composer-footer chip per [refs main §5](./ui-revamp-v0-refs.md). |
| `PeerAddressInput` | _none_ | New. `forms/peer-address-input.tsx`. |
| `SpacesRail` | _none_ explicit; layout shell in `layout/desktop-shell.tsx` may host one | New. `nav/spaces-rail.tsx`. |
| `CharDisplay` | [`tapia/char-display.tsx`](../../../../desktop/desktop-ui/src/components/tapia/char-display.tsx) | Keep. Extract any inline shadows; verify density tokens. |
| `DensityProvider` | _none_ | New. `primitives/density-provider.tsx`. |
| `Empty` | _none_ | New. `primitives/empty.tsx` with `variant` prop (`full` / `compact` / `filter`). |
| `DenseRow` | partial in `lists/roster-item.tsx` | **Refactor.** Generalize roster-item's slot model into `lists/dense-row.tsx`. |
| `CommandPalette` | [`overlays/command-palette.tsx`](../../../../desktop/desktop-ui/src/components/overlays/command-palette.tsx) (166 lines) | **Refactor.** Re-section per [refs space-lifecycle §4.8](./ui-revamp-v0-refs-space-lifecycle.md): Recent docs → Spaces → Documents → Commands. |
| `TreePopover` | _none_ | New. `nav/tree-popover.tsx`. |
| `PopupShell` | precedent: `layout/window-chrome.tsx` | **Refactor.** Extract to `popup/popup-shell.tsx`; expose the 4-glyph cluster from [refs popup-window §6](./ui-revamp-v0-refs-popup-window.md). |
| `SelectionAIBar` | _none_ | New. `editor/selection-ai-bar.tsx`. |
| `InlineAIAcceptBar` | _none_ | New. `editor/inline-ai-accept-bar.tsx`. |
| `NodeAIRegistry` | _none_ | New. `editor/node-ai-registry.ts` (logic, no UI). |
| `InlineAIStream` | _none_ | New. `editor/inline-ai-stream.tsx`. |

### Gaps found during this pass — proposed additions

| Component | Why | File |
|---|---|---|
| `SettingsTabs` | Locked by [refs space-lifecycle §4.2](./ui-revamp-v0-refs-space-lifecycle.md) (horizontal pill/underline tabs) but missing from PRD §6. Reused by every settings page. | `nav/settings-tabs.tsx` |
| `Pill` | Status pills (bot pending/active/failed; default backend; capability scope counters) are everywhere. Tailwind-only is fine, but a typed primitive locks the variants and the color → semantic mapping. | `primitives/pill.tsx` |

These two should be added to PRD §6 in a small follow-up edit; for this scaffold plan I treat them as in-scope.

## 3. Build waves

The waves below are dependency-ordered. Within a wave, components are independent and can be built in parallel.

### Wave 0 — Foundation

| Item | Description |
|---|---|
| Token sweep (§1) | Tokens land in `styles.css`; existing shadow utilities removed. |
| `DensityProvider` | React context exposing `density: 'dense' \| 'cozy'`. v0 ships dense only; the provider exists so post-v0 cozy is a config flip. |
| Storybook conventions doc | Update [docs/src/development/ui-components.md](../../development/ui-components.md) with the story shape every component must follow (states matrix, hover/focus/disabled/empty/error, dark theme variant). |

### Wave 1 — Primitives (depend only on Wave 0)

| Component | Refs anchor |
|---|---|
| `Empty` | [refs files-density §2](./ui-revamp-v0-refs-files-density.md) |
| `DenseRow` (refactor from `roster-item`) | [refs files-density §4](./ui-revamp-v0-refs-files-density.md) |
| `Pill` (new primitive) | Status patterns in [refs assistant-bots §3](./ui-revamp-v0-refs-assistant-bots.md) |
| `PeerAddressInput` | [refs main §4](./ui-revamp-v0-refs.md) step 1 |
| `CharDisplay` (extract inline styles) | already locked in [`tapia/char-display.tsx`](../../../../desktop/desktop-ui/src/components/tapia/char-display.tsx) |
| `SpacesRail` | [refs space-lifecycle §3](./ui-revamp-v0-refs-space-lifecycle.md) |

### Wave 2 — Popovers and dropdowns (depend on Wave 1)

| Component | Refs anchor |
|---|---|
| `SlashMenu` | [refs editor §1](./ui-revamp-v0-refs-editor.md) + ADR-0005 §11 amendment |
| `SelectionBubble` (refactor from `bubble-toolbar`) | [refs editor §2](./ui-revamp-v0-refs-editor.md) |
| `MentionPicker` | [refs main §3](./ui-revamp-v0-refs.md) |
| `BackendSwitcher` (refactor from `ai-model-selector`) | [refs main §5](./ui-revamp-v0-refs.md) |
| `TreePopover` | [refs space-lifecycle §3](./ui-revamp-v0-refs-space-lifecycle.md) |
| `CommandPalette` (refactor existing) | [refs space-lifecycle §3](./ui-revamp-v0-refs-space-lifecycle.md) |
| `SettingsTabs` | [refs space-lifecycle §2](./ui-revamp-v0-refs-space-lifecycle.md) |
| `SelectionAIBar` | [refs editor-ai §1](./ui-revamp-v0-refs-editor-ai.md) |

### Wave 3 — Composites (depend on Waves 1–2)

| Component | Refs anchor |
|---|---|
| `Panel` | [PRD §3](./ui-revamp-v0.md) + [refs main §2](./ui-revamp-v0-refs.md) |
| `PanelContainer` | (composes `Panel`) |
| `BotList` | [refs assistant-bots §3](./ui-revamp-v0-refs-assistant-bots.md) |
| `CapabilityForm` | [refs main §4](./ui-revamp-v0-refs.md) step 2 |
| `InlineAIAcceptBar` | [refs editor-ai §4](./ui-revamp-v0-refs-editor-ai.md) |
| `InlineAIStream` | [refs editor-ai §5](./ui-revamp-v0-refs-editor-ai.md) |
| `PopupShell` (refactor from `window-chrome`) | [refs popup-window §2](./ui-revamp-v0-refs-popup-window.md) |

### Wave 4 — Logic / glue

| Component | Refs anchor |
|---|---|
| `NodeAIRegistry` | [refs editor-ai §3](./ui-revamp-v0-refs-editor-ai.md). Pure logic + TS types; TipTap extension that lets each block type register AI actions, consumed by `SlashMenu`, `SelectionAIBar`, and the right-click block menu. No UI. |

## 4. Acceptance criteria — when is a component done?

Before a `desktop/soma` screen wires a new (or refactored) component, the component must satisfy:

1. **Storybook story exists** at `src/stories/<component>.stories.tsx`. The story must cover, at minimum: default, hover, focus-visible, disabled, empty (if applicable), error (if applicable), and dark theme. For list rows / popovers also: keyboard navigation.
2. **No inline shadow utilities.** Only `shadow-elevated` from the token sweep is permitted, and only on modal + popup classes.
3. **`DensityProvider` aware.** Reads density (even if v0 only emits `dense`) so post-v0 cozy is a switch, not a rewrite.
4. **Inline failure surfaces.** Any primary action inside the component (form submit, dispatch, copy, etc.) renders failures inline. No `toast(...)` calls for these paths. (Cross-cutting ADR-0005 §6.)
5. **Keyboard-traversable** if the component is a list, menu, or has multiple targets. Arrow keys + Enter; Esc closes.
6. **Color contrast ≥ AA at 14px.** Run [`pnpm --filter @soma/ui lint`](../../../../desktop/desktop-ui/package.json) and the existing visual-regression story snapshots.
7. **Refs anchor cited in the component file's JSDoc header**, so a future reader can find the lock pattern in one hop.

Wave 4's `NodeAIRegistry` substitutes "Storybook story" with "TipTap extension test exercising registration + action resolution for at least three node types".

## 5. Cutover order into `desktop/soma`

Once a wave's components meet acceptance, the dependent `desktop/soma` screens swap from their existing implementation in a separate PR per screen — branch is the gate, no feature flag.

Screen-cutover sequence, ordered by v0 product priority ([PRD §7 step 6](./ui-revamp-v0.md)):

1. **Space settings shell + Bots tab** (PRD §4.2 + §4.4). Requires `SettingsTabs`, `BotList`, `PeerAddressInput`, `CapabilityForm`, `Empty`, `DenseRow`, `Pill`, `DensityProvider`. → Waves 0, 1, 2, 3.
2. **Assistant tab** (PRD §4.3). Adds `BackendSwitcher`'s settings counterpart. → reuses Wave 2.
3. **Right area panel stack + chat panel** (PRD §3, §4.5). Requires `Panel`, `PanelContainer`, `MentionPicker`, refactored chat composer with `BackendSwitcher` in footer.
4. **Editor surfaces** — `SlashMenu`, `SelectionBubble`, `SelectionAIBar`, `InlineAIAcceptBar`, `InlineAIStream`, `NodeAIRegistry`. Requires Waves 2–4.
5. **Document column header** — breadcrumb + `TreePopover`. → Wave 2.
6. **Spaces rail refactor** (PRD §4.8). → Wave 1.
7. **Command palette wiring** (cross-cutting). → Wave 2.
8. **Typing popup** (PRD §4.7). Requires `PopupShell` + the existing `CharDisplay`. → Wave 3.

This sequence keeps "add a bot" — the v0 product priority — at the front. The first end-user-visible improvement is space settings, not the editor revamp.

## 6. Backend items that must land in parallel

Several frontend cutovers depend on the embedded daemon ([`backend/crates/daemon`](../../../../backend/crates/daemon/), [`backend/crates/agentd`](../../../../backend/crates/agentd/), [`backend/crates/soma-node`](../../../../backend/crates/soma-node/)) gaining new surface area:

- **`list_space_bots`** on `SomaHandle` — required by space settings Bots tab (cutover 1).
- **Bot handshake / capability issue / registration** through the napi facade — required by `CapabilityForm`.
- **Bot status stream** over the existing event channel — required for live status pills.
- **ACP backend management** (add, mark default, validate) — required by Assistant tab (cutover 2).
- **ACP chat completion + streaming** to a per-space chat thread — required by chat panel (cutover 3).
- **`@bot:` dispatch routing** — required by §4.6.
- **Per-node AI action invocation** routed through `soma-agentd` ACP — required by editor surfaces (cutover 4).

These are tracked separately. The scaffold plan assumes the daemon team confirms what already exists vs. what needs new endpoints; gaps are filed as backend issues, not blockers to wave-0/1/2 UI work. UI work in waves 0–2 has no daemon dependency and can begin immediately.

## 7. Out of scope for v0 scaffold

- Cozy / oversized density variants. `DensityProvider` ships, but only emits dense.
- Theme switcher UI. `cmyk` stays the default; `luxury` is exercised in Storybook for contrast testing only.
- Component-level i18n. Strings hardcoded English in v0.
- Visual regression infrastructure beyond what already exists in Storybook.
- Migration of every existing `desktop/soma` screen — only the screens listed in §5 are in v0.

## 8. Open questions for the lock pass

1. **`overlays/command-palette.tsx` refactor scope.** Should the cross-cutting palette and the `TreePopover` (anchored under breadcrumbs) share an implementation, or are they two surfaces that look similar but diverge? Recommend: shared `Popover` + shared `RowList` primitives, but distinct top-level components — sections and scopes differ enough that one prop-set would balloon.
2. **`Pill` API breadth.** Two variant axes — semantic (`status` / `count` / `meta` / `default-marker`) and tone (`neutral` / `info` / `success` / `warn` / `error`). Lock the matrix before the component lands so consumers don't invent variants ad-hoc.
3. **`PanelContainer` split gesture.** Drag-to-split is in the PRD but has no clean refero analog. Keyboard fallback (`⌘\\` to split the focused panel) might be the safer v0 path with drag added in v0.1.
4. **`InlineAIStream` and `ai-chat`'s existing streaming code.** Today's [`chat/ai-message.tsx`](../../../../desktop/desktop-ui/src/components/chat/ai-message.tsx) presumably handles streaming inside the chat. Confirm whether the new `InlineAIStream` shares its `Thinking…` pill subcomponent with the chat (it should, per [refs editor-ai §5](./ui-revamp-v0-refs-editor-ai.md)) or is built fresh.
5. **CharDisplay extraction work.** Whether `tapia/char-display.tsx` needs any genuine change or just an audit. If just an audit, drop it from Wave 1 and treat it as already done.

---

_Once this scaffold is locked, the next deliverable is Wave 0 — the token sweep PR — followed by Wave 1 component PRs in parallel._
