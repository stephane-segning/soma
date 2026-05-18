# ADR-0005: UI revamp v0 — single UI system, panel-stack right area, ACP-based assistant

## Context

Soma's renderer evolved from two merged apps (the original Soma workspace and Tapia typing companion) and carries the friction of that merger:

- Two coexisting UI layers — a `@soma/ui` package and ad-hoc components inside `desktop/soma/src/renderer/src/routes/practice/`.
- Settings flows accumulated buttons and floating CTAs in many places; there is no single rule for save behaviour.
- The chat is currently absent in the renderer; future work plans called it "the chat panel" — a single fixed surface — but actual user needs span history, sub-pages, attached files, agenda, exercise queues, etc.
- Bot membership exists in the daemon (`soma-daemon` capability model) but has no UI; nothing distinguishes a conversational LLM assistant from a programmable p2p bot.
- LLM access was planned as direct OpenAI-compatible HTTP, which would force per-provider plumbing.
- There is no second-window mechanism; typing exercises live inside the main app, sharing the same chrome as workspace navigation.
- Density is inconsistent: shadows everywhere, oversized padding, line-heights tuned for marketing surfaces, not for 14–16" laptops doing real work.

The UI revamp v0 PRD ([prd/ui-revamp-v0.md](../prd/ui-revamp-v0.md)) and the six refero reference docs that accompany it ([overview](../prd/ui-revamp-v0-refs.md), [space lifecycle](../prd/ui-revamp-v0-refs-space-lifecycle.md), [assistant + bots](../prd/ui-revamp-v0-refs-assistant-bots.md), [editor](../prd/ui-revamp-v0-refs-editor.md), [files + density](../prd/ui-revamp-v0-refs-files-density.md), [popup window](../prd/ui-revamp-v0-refs-popup-window.md)) settled the open design questions. This ADR records the architectural decisions that bind multiple flows together. Visual specifications stay in the refs docs; this ADR holds the load-bearing rules.

## Decisions

### 1. One UI system: `@soma/ui` on Tailwind v4 + DaisyUI v5

All shared components live in `@soma/ui`. The `desktop/soma/src/renderer/src/routes/practice/components/` tree is dismantled — reusable pieces migrate to `@soma/ui` (the [`CharDisplay`](../../../../desktop/desktop-ui/src/components/tapia/char-display.tsx) component is already there); the rest dies. The renderer does not vend a second UI layer.

### 2. Layout is a four-column shell with a stackable right area

- 52px **icon spaces rail** (far left)
- narrow **page tree column** (collapsible to icon strip in tight viewports)
- **document column** (TipTap)
- **right area** — a stack of independently controllable **panels** (not a single chat pane)

Right-area panels share a header (title · collapse · close · drag-handle) and a body. The panel container vertically stacks panels by default and supports a user-driven horizontal split (max 2 columns). Panels are pinned to a space or to a document; switching documents reflows. Chat is one panel among siblings — history, sub-pages, attached files, agenda, exercise queue, presence, etc., all live in the same container.

Width budgets degrade as the window shrinks:
1. **Comfortable (≥ ~1280px usable):** all columns docked, multiple panels visible.
2. **Tight (~960–1280px):** docked right area collapses to icon strip; opening a panel slides it in as a right-edge drawer with overlay.
3. **Very small (< ~960px):** right area enters fullscreen-takeover mode when summoned. Editor is the priority surface; panels only show on demand.

### 3. Tabbed-cards settings IA, auto-save on blur, no global Save

Space settings is a single page with horizontal pill/underline tabs (General · Members · Assistant · Bots · Sharing · Danger). Each tab is one screen of sectioned cards.

- **Save model.** Auto-save on blur. Per-section Save buttons are banned. Errors surface inline under the field. Success is silent.
- **Primary actions** exist only for *initiation* (Add backend, Add bot) and *destruction* (Danger tab).
- **Danger zone.** Red-labelled card. Destructive actions open an inline slug-confirm form; the action stays disabled until the typed slug matches.

This rule is universal — settings UIs across the app obey it, not just space settings.

### 4. LLM vs. bot are distinct first-class concepts

- **LLM (assistant).** Conversational space member, configured via Settings → Assistant. Soma speaks the **Agent Client Protocol (ACP)** — the same protocol Zed uses — so backends are pluggable: Ollama, LM Studio, Codex, OpenAI-compatible (via ACP shim). ACP backends are managed by the embedded `soma-agentd` runtime; the renderer reaches them through the napi `SomaHandle`, not by dialing services directly.
- **Bot.** Programmable p2p peer with capabilities. Added by **pasting a peer address** (no catalog, no discovery). RBAC governs who may add a bot and with what scope.

Both are space members under the existing capability model ([space-authorization-model.md](../../space-authorization-model.md)). The UI distinguishes them; the auth layer does not.

Users address bots inline with `@bot:<alias>`. Bot mentions render as a pill with a distinct icon and surface tint so the user sees at a glance that the mention will dispatch a command to a bot runtime, not generate an LLM completion. When the composer text begins with `@bot:`, the send button flips its label to `Dispatch` and the composer left-edge picks up the bot-mention tint.

### 5. Backend switcher in the composer footer

The ACP backend picker sits in the **composer footer** as a chip — `<provider-mark> <name> ↕` — not in the chat header. Vertical chrome stays free; the control lives where the user's eye is when picking. The dropdown also surfaces "Add backend…" which deep-links to the Assistant settings tab.

### 6. Inline failures, no toast-only feedback for primary actions

Any primary action (saving settings, issuing a capability, dispatching to a bot, attaching a file) renders failures in the same surface the success would have rendered in. Toast-only errors are banned for these paths. Toasts remain valid for cross-cutting transient notifications (e.g. exercise completion, see §10).

### 7. Density is a token system, not a feeling

- **Font sizes:** 14px body, 13px UI-sm, 11px UI-xs.
- **Line-height:** **1.5** for body, 1.2 for UI chrome. The original PRD specced 1.45 — the refs pass bumped it after every dense product surveyed (Linear, Mercury, Resend) ran at ~1.5 at 14px.
- **Row heights:** 32 / 40 / 52px tiers for dense / cozy / oversized lists.
- **Borders vs shadows.** 1px borders + a background step on every elevated surface. **One** shadow token, reserved for modal + popup window. Everywhere else borders carry the elevation.
- **Border radius.** `rounded-md` (6px) max for surfaces, `rounded-sm` for chips.

A `DensityProvider` exists in `@soma/ui` for future cozy / oversized variants; v0 ships dense only.

### 8. `Empty` is a single primitive with three variants

All empty states use the `Empty` component:
- **Full** — icon + headline + optional one-line subtext + optional single CTA.
- **Compact** — dashed-border single line, no icon, no CTA. For narrow panels (chat, attachments, sub-pages).
- **Filter** — same shape as the active variant, but the CTA becomes `Clear filter ×` (secondary slot).

The empty *document* is **not** an `Empty` use — it's an editor placeholder.

### 9. `DenseRow` is the single list-row primitive

Members, bots, attachments, recent docs, and any future list of objects share one row primitive: `leading · primary (+sub) · status pill · meta · always-visible ⋯`. Overflow menus are **never** hover-only — actions are always visible.

### 10. Multi-window for focus tasks via a reusable `PopupShell`

Focus tasks (typing in v0; exams and surveys later) open in their own `BrowserWindow`, routed by `#/popup/<task>/<id>`. The popup chrome is a reusable `@soma/ui` component: 520×360 default, min-width 480px, auto-hide to a 28px drag strip on input focus. Glyph cluster in the drag region, flush-right: **pin** (always-on-top toggle, default off) · **restart** · **return-to-main** (closes popup + focuses main, leaves state resumable) · **close**. The OS window title is the task's own name, not `Soma — Typing`, so the popup is identifiable in the dock / window switcher.

Completion of a focus task closes the popup, refocuses main, and emits a single toast (the one allowed toast pattern in v0): `<Task> complete · <metric> · <metric> · View result`.

### 11. Editor surfaces: slash menu, selection bubble, block menus

- **SlashMenu.** Single-column popover anchored at the caret. Rows = monochrome icon + label + right-aligned shortcut hint. Sections in fixed order: Text · List · Embed · Action · Advanced. Substring filter across labels + aliases. **No AI tile** — AI lives in the right-area chat panel; a slash AI block would duplicate intent across surfaces.
- **SelectionBubble.** Single dark pill above selection. Order: `<block-style ▾>` · B · i · U · S · `</>` · link · highlight · comment · `⋯`. Dividers between block / inline / action clusters. The link icon swaps the row into a single-input link mode in place.
- **Block hover affordances.** Left gutter (~24px) holds a `⋮⋮` drag handle and a `+` insert-below button, hover-only. Right-click anywhere in the row opens the per-block menu.

Inline AI is a third editor surface alongside SlashMenu and SelectionBubble — see §13. SlashMenu still has no AI tile (the lock above holds); instead, the SlashMenu's leading input row doubles as the AI prompt entry when the typed text does not match a block name. SelectionBubble grows a trailing "Ask AI" chip that opens the SelectionAIBar; the bubble itself remains a formatting surface. Block menus (right-click) gain an `AI ▸` cluster fed by the per-node-type AI registry.

### 12. Document tree lives in a popover, not a third pane

The page tree is **not** a third docked pane. It opens as a popover anchored under the last breadcrumb segment in the document column header, with sections Search / Recent / Starred / All pages and a footer chip-strip teaching keyboard shortcuts. Scope defaults to the current space; Tab widens to all spaces.

A separate ⌘K **CommandPalette** covers cross-cutting navigation: Recent docs (any space) → Spaces → Documents → Commands.

### 13. Inline AI as a content-transformation surface

Inline AI is a transformation surface bound to a *selection*, *caret position*, or *node* — distinct from the conversational chat panel (§4 / PRD §4.5) and from the block-inserting SlashMenu (§11). It is invoked by `⌘J`, by the trailing chip on the SelectionBubble, by the SlashMenu input row when not matching a block name, or by the `AI ▸` cluster in a node's right-click menu.

Results stream into the document at the invocation site. A single accept bar — `Accept` · `Try again` · `Refine…` · `Discard` — closes the interaction. While streaming, the affected region is non-editable and renders in the accent color with a dashed accent underline; a `Thinking…` pill (same component as the chat panel) covers the pre-first-token window.

Every inline AI invocation appends a collapsed turn to the chat panel as audit log, and the inline accept bar exposes `Open in chat` for escalation into a full conversation when a one-shot rewrite needs to become a discussion. This keeps the chat panel as the single conversation/audit surface (§4 / PRD §4.5) without forcing a panel context switch for one-shot edits.

No diff view in v0 (prose-first; diffs become opt-in later for code-block nodes). No per-paragraph hover AI button. No separate `/ai` slash command. One surface, multiple invocation paths, one accept bar.

Detailed visual specification and the reference pass that produced this decision live in [prd/ui-revamp-v0-refs-editor-ai.md](../prd/ui-revamp-v0-refs-editor-ai.md).

## Consequences

Positive:

- One UI system kills the second-tree maintenance tax inside `practice/`.
- Treating the right area as a panel stack (vs "the chat panel") matches actual usage and avoids the trap of cramming history/agenda/sub-pages into chat.
- ACP unifies the LLM integration story behind a single contract; switching providers becomes a config change, not a refactor.
- The LLM-vs-bot split makes the `@bot:` mention semantically clear and lets the auth model stay simple (both are members; UI carries the distinction).
- Density tokens stop being negotiable per screen. New screens inherit the system.
- The `DenseRow` and `Empty` primitives prevent the visual drift that produced "buttons everywhere" the first time around.
- Multi-window via a reusable `PopupShell` makes future focus tasks (exams, surveys) a route, not a project.

Negative / follow-ups:

- The "no catalog" decision for bots means a less discoverable v0; bot directories and friend-of-friend discovery are explicitly deferred.
- ACP plumbing inside `soma-agentd` is a new surface; the v0 implementation must verify that the napi handle exposes enough state for the composer-footer switcher to stay live.
- The `PanelContainer` user-driven horizontal split has no clean prior art in our refs (closest is VS Code editor groups); we expect to iterate the gesture/keyboard surface post-v0.
- Settings auto-save mandates per-field validators that can run on blur without round-trips; the embedded daemon makes this cheap, but it has to be done deliberately.
- Bot status streaming requires the daemon to expose a per-space subscription channel; the PRD already calls this out as a backend item to verify.

## Implementation status

- Decision recorded; PRD revised against the refs pass on 2026-05-18.
- ADR governs the next phase: a `@soma/ui` component scaffolding plan (one Storybook story per new component before any consumer wires it in `desktop/soma`).
- First implementation cut targets §4.4 + §4.2 (space settings + bots tab) because "add a bot" is the v0 product priority.

## Related material

- PRD: [prd/ui-revamp-v0.md](../prd/ui-revamp-v0.md)
- Refs (overview): [prd/ui-revamp-v0-refs.md](../prd/ui-revamp-v0-refs.md)
- Refs (space lifecycle, §4.1 / §4.2 / §4.8): [prd/ui-revamp-v0-refs-space-lifecycle.md](../prd/ui-revamp-v0-refs-space-lifecycle.md)
- Refs (assistant + bots, §4.3 / §4.4 status / §4.6 / streaming): [prd/ui-revamp-v0-refs-assistant-bots.md](../prd/ui-revamp-v0-refs-assistant-bots.md)
- Refs (editor, §6 SlashMenu / SelectionBubble / block menus): [prd/ui-revamp-v0-refs-editor.md](../prd/ui-revamp-v0-refs-editor.md)
- Refs (inline editor AI, §13): [prd/ui-revamp-v0-refs-editor-ai.md](../prd/ui-revamp-v0-refs-editor-ai.md)
- Refs (files + density tokens + DenseRow + Empty): [prd/ui-revamp-v0-refs-files-density.md](../prd/ui-revamp-v0-refs-files-density.md)
- Refs (popup window, §4.7 chrome): [prd/ui-revamp-v0-refs-popup-window.md](../prd/ui-revamp-v0-refs-popup-window.md)
- Capability model context: [space-authorization-model.md](../../space-authorization-model.md)
- Backend collapse context: ADR-0001 (Superseded)
