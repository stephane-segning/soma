# `@soma/ui` Audit — Storybook reality check

Companion to [ui-revamp-v0-scaffold.md](./ui-revamp-v0-scaffold.md). The user flagged that "most components in `@soma/ui` are broken." This audit walked every Storybook story in [desktop/desktop-ui/src/stories/](../../../../desktop/desktop-ui/src/stories) — 7 story files, 17 stories total — and identifies the root causes so the scaffold plan can give honest refactor-vs-rebuild verdicts.

Verdict in one sentence: **two root causes account for almost everything visible as "broken"**, plus three components that work and form an acceptable starting point. The scaffold plan's refactor-targets section needs corrections accordingly.

## Stories visited

| Story | Verdict | Notes |
|---|---|---|
| `Chat / AI Conversation` (`with-thinking`, `tools-and-sources`, `streaming-thinking`) | **Works** | Roles, expandable thinking card, tool + source headers, scrollback, composer with attach / mic / model chip render. Mock content uses stale terms (e.g. "Install daemon") — content, not component bug. |
| `Inputs / AI Input` (`default`, `with-preset`) | **Theme-broken** | Dark navy story background, dark text from `cmyk` theme → unreadable. Component code is fine; misconfigured story decorator (root cause #2 below). |
| `Inputs / AI Model Selector` (`default`) | **Theme-broken + clipped** | Same dark-on-dark; the open dropdown floats off the left edge of the story canvas. |
| `Inputs / PolymorphButton` (`variants`, `sizes`, `icon-only`, `loading`) | **Code-broken** | Every textual variant renders as a circle with overflowing label ("Primar", "Secondar", "Subtle" invisible). Root cause #1. |
| `Desktop / Shell` (`basic`, `with-sidebars`, `with-header-and-footer`, `scrollable-content`, `persistent-widths`) | **Works (incomplete)** | Three-column layout with nav rail, main, status rail renders. No 52px icon rail or right panel-stack yet — but the foundation is the closest extant precedent for the four-column shell. |
| `Desktop / Overlays` (`overlay-showcase`) | **Mixed** | Modal opens, content readable. *But*: trigger buttons are circles with truncated text (root cause #1), and the modal itself uses banned `shadow-2xl` + `rounded-2xl` via the `glass-panel` / `surface-card` utilities in styles.css. |
| `Tapia / Char Display` (`default`, `live-typing`) | **Works** | Matches the locked design. Color-coded grapheme diff renders correctly. Density acceptable. |

Stories that **don't exist** for components my scaffold plan named as refactor targets:
- `overlays/command-palette.tsx` — no story; behavior unverified.
- `overlays/bubble-toolbar.tsx` — no story; behavior unverified.
- `overlays/context-menu.tsx` — no story.
- `overlays/notification-drawer.tsx` — no story.
- `lists/roster-item.tsx` — no story.
- `forms/ai-model-selector.tsx` — has a story, but the story is broken (above).
- `presence/status-badge.tsx` — no story.
- `cards/launcher-card.tsx` — no story.
- `layout/window-chrome.tsx` — no story.

So the "starting points" the scaffold leaned on are mostly unverified. Treat them as code-with-types-and-shape, not as proven implementations.

## Root cause #1 — `PolymorphButton` defaults to `shape="circle"`

[desktop/desktop-ui/src/components/actions/polymorph-button.tsx:54](../../../../desktop/desktop-ui/src/components/actions/polymorph-button.tsx) declares `shape = "circle"` as the default. DaisyUI's `btn-circle` constrains the button to a fixed-size disc — fine for icon-only triggers, wrong for labelled buttons. Every consumer that doesn't pass `shape="default"` ends up with a circle plus overflowing label text. This is what makes `PolymorphButton / Variants`, the Overlays trigger buttons, and the modal's `Save` button look broken.

**Fix.** Flip the default to `shape="default"`. Callers that actually want a disc keep their explicit `shape="circle"`. Wave 1 scope.

## Root cause #2 — Storybook decorator's dark background fights the DaisyUI light theme

[desktop/desktop-ui/.storybook/preview.tsx](../../../../desktop/desktop-ui/.storybook/preview.tsx) sets the default story background to `#0f172a` (dark navy):

```ts
backgrounds: {
  default: "Soma surface",
  values: [
    { name: "Soma surface", value: "#0f172a" },
    { name: "Paper", value: "#f8fafc" },
  ],
},
```

But [desktop/desktop-ui/src/styles.css](../../../../desktop/desktop-ui/src/styles.css) registers `cmyk --default, luxury` — so DaisyUI's default theme is light (`cmyk`). Components correctly use semantic colors (`text-base-content`, `bg-base-100`), which resolve to dark text on light backgrounds in `cmyk`. Render them on a hardcoded dark canvas and the text vanishes.

This is what creates the "AI Input / AI Model Selector / PolymorphButton" dark-on-dark reading. The components themselves aren't broken — the story chrome is fighting them.

**Fix options** (Wave 0):
1. Default the story background to `Paper` (the light value already in the array). Cheapest fix; honors the existing `cmyk` default.
2. Set `data-theme="luxury"` on the story root when the background is dark, and `cmyk` when light. Story-by-story consistent, but every component must be readable in both — that's a separate audit.
3. Drop the dark background entirely and use the DaisyUI `base-100` color directly so the story background follows the theme.

Recommendation: **#3 — drop the hardcoded dark default**, let `bg-base-100` (theme-driven) be the canvas. Each story can opt into the dark theme via `parameters.theme = 'luxury'` for explicit dark-mode coverage.

## Style utilities that directly contradict ADR-0005

[styles.css](../../../../desktop/desktop-ui/src/styles.css) defines:

```css
@utility glass-panel {
  @apply border border-base-300/70 bg-base-100/70 backdrop-blur-xl shadow-2xl;
}

@utility surface-card {
  @apply bg-base-100/80 border border-base-300/60 shadow-xl rounded-2xl;
}
```

Both use heavy shadows (`shadow-2xl`, `shadow-xl`) and oversized radius (`rounded-2xl`). ADR-0005 §7 locks "1px border + bg-step on every elevated surface; **shadow only on modal + popup window**" and §3 "rounded-md (6px) max for surfaces". The overlay showcase's modal uses `glass-panel` and therefore inherits both bans-in-spirit.

**Fix** (Wave 0 token sweep):
- Replace `surface-card` with a border-only variant (`border border-base-300/60 rounded-md bg-base-100`).
- Replace `glass-panel` with a modal-and-popup-only `elevated-surface` utility that uses the single allowed shadow token + `rounded-md`.
- Audit every consumer of these utilities (`grep -r glass-panel surface-card desktop/`) and migrate.

## Existing components that *do* work — keep them

These are the foundation we don't have to rebuild:

| Component | Path | Use in v0 |
|---|---|---|
| `tapia/char-display.tsx` | [link](../../../../desktop/desktop-ui/src/components/tapia/char-display.tsx) | Keep as is. Verify density tokens in Wave 1; otherwise no change. |
| `chat/ai-conversation.tsx` + helpers | [link](../../../../desktop/desktop-ui/src/components/chat/ai-conversation.tsx) | Foundation for the right-area chat panel (PRD §4.5). Will need: composer-footer `BackendSwitcher` plug, mention-pill rendering for `@bot:`, streaming chrome alignment with `InlineAIStream`. Refactor, don't rebuild. |
| `chat/ai-thinking.tsx` | [link](../../../../desktop/desktop-ui/src/components/chat/ai-thinking.tsx) | The `Thinking…` pill we want both in chat (§4.5) and at the editor caret (§13 / [refs editor-ai §5](./ui-revamp-v0-refs-editor-ai.md)). Already exists; extract into a shared primitive consumed by both. |
| `layout/desktop-shell.tsx` | [link](../../../../desktop/desktop-ui/src/components/layout/desktop-shell.tsx) | Closest precedent for the four-column shell. Needs additions: 52px icon spaces rail, right panel-stack column with the `PanelContainer`. Refactor target. |
| `overlays/modal.tsx` | [link](../../../../desktop/desktop-ui/src/components/overlays/modal.tsx) | Used by Overlays showcase; renders. Needs to swap off `glass-panel`'s `shadow-2xl` once the token sweep lands. |
| `overlays/toast.tsx` | [link](../../../../desktop/desktop-ui/src/components/overlays/toast.tsx) | Already configured to use `bg-success` / `bg-error` semantic colors (see styles.css). Per ADR-0005 §6 toasts are restricted to the focus-task completion path; keep this one available, don't expand its uses. |

## Updated refactor-vs-rebuild verdicts (overrides scaffold §2)

This audit overrides the verdicts in [ui-revamp-v0-scaffold.md §2](./ui-revamp-v0-scaffold.md#2-mapping-prd-6-to-current-soma-ui-reality):

| PRD §6 component | Original verdict | Audit-corrected verdict |
|---|---|---|
| `BackendSwitcher` | Refactor `forms/ai-model-selector.tsx` | **Rebuild.** Existing component renders broken even in its sole story (theme + clipped dropdown). Move logic to a new `chat/backend-switcher.tsx` patterned on Rox 438aaaec from [refs main §5](./ui-revamp-v0-refs.md); discard the old file. |
| `SelectionBubble` | Refactor `overlays/bubble-toolbar.tsx` (65 lines) | **Rebuild.** No story, no visual confidence. Read the existing file for prior intent, then write fresh against [refs editor §2](./ui-revamp-v0-refs-editor.md). |
| `CommandPalette` | Refactor `overlays/command-palette.tsx` (166 lines) | **Story-first refactor.** Add a story exercising the locked sections (Recent docs → Spaces → Documents → Commands) *before* re-sectioning. If the existing internals don't survive contact with the story, rewrite. |
| `DenseRow` | Refactor `lists/roster-item.tsx` | **Story-first refactor.** Same posture — no story today, low confidence in the existing slot model. Story-first, then keep what survives. |
| `PopupShell` | Refactor `layout/window-chrome.tsx` | **Story-first refactor.** Same posture. |
| `PolymorphButton` (existing — not in PRD §6) | n/a | **Fix the default.** Flip `shape = "default"`. Cross-cutting bug; Wave 1 scope. |

Components verdict unchanged from scaffold §2: all new components, `Panel` / `PanelContainer` / `Empty` / `SettingsTabs` / `Pill` / `MentionPicker` / `SlashMenu` / `BotList` / `CapabilityForm` / `PeerAddressInput` / `TreePopover` / `NodeAIRegistry` / `SelectionAIBar` / `InlineAIAcceptBar` / `InlineAIStream` / `SpacesRail` / `DensityProvider`.

## Wave 0 additions

The token sweep already specified in the scaffold gains two concrete tasks:

1. **Storybook decorator fix.** Drop the hardcoded `#0f172a` default background from [.storybook/preview.tsx](../../../../desktop/desktop-ui/.storybook/preview.tsx); let `bg-base-100` carry the canvas. Add a per-story `parameters.theme` knob for explicit `cmyk` / `luxury` testing.
2. **Story-first acceptance.** No new story written in Wave 1 may render unreadably on the default background. CI check: a small Playwright story-render test that asserts text contrast ≥ AA against the surface background. (Cheap; the existing Storybook test-runner is sufficient.)

Plus the original sweep tasks:
- Add density tokens (font sizes, line-heights, row heights) to [styles.css](../../../../desktop/desktop-ui/src/styles.css).
- Kill `glass-panel` (it inlines `shadow-2xl`) and `surface-card` (it inlines `shadow-xl rounded-2xl`); replace with token-driven versions.
- Audit + migrate consumers of those utilities.

## What this means for the scaffold's cutover order

Unchanged. The first end-user-visible cutover is still space settings + Bots tab — the components feeding it (`SettingsTabs`, `BotList`, `PeerAddressInput`, `CapabilityForm`, `Empty`, `DenseRow`, `Pill`, `DensityProvider`) are all **new** or **story-first refactor**, so the audit doesn't change the dependency graph.

What *does* change: the chat panel cutover (cutover 3 in scaffold §5) now leans on `chat/ai-conversation.tsx` as a working foundation rather than a refactor risk. That cutover gets cheaper than the scaffold suggested.

## Open follow-up

- **Theme matrix.** Once the storybook decorator is fixed, run every story under both `cmyk` and `luxury` and capture any components that fail contrast in either. Likely 3–5 components; surface them as separate Wave 1 issues.
- **Story coverage debt.** Every claimed-refactor component (command-palette, bubble-toolbar, context-menu, etc.) needs a story before the refactor begins. This is mechanical work and a good first-task for an implementer onboarding to the codebase.
- **`PolymorphButton` consumer sweep.** After flipping the default to `default`, grep every caller; many likely currently pass `shape="default"` explicitly. Drop those — they're the workaround for the bad default.
- **Yoopta subpath.** `AGENTS.md` (line 167, at the repo root — outside this docs tree) lists `@soma/ui/yoopta` as a subpath. The PRD treats the editor as TipTap-only. Confirm whether `@soma/ui/yoopta` still ships anything or is dead code to delete in the cleanup.

---

_This audit is dated; rerun when material UI work lands. The Storybook test-runner contrast check (Wave 0 §2 above) is what keeps it dated automatically._
