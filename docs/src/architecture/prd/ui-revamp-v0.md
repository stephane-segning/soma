# PRD: UI Revamp v0

Status: **Draft** — open for iteration. Locked decisions move to ADR-0005.

## 1. Vision

Soma is a Notion-style personal workspace where **the rich text editor is the user's memory** and **the LLM is the productivity tool that operates on that memory**. Documents, spaces, and notes are the substrate; the assistant turns them into summaries, exercises, plans, agendas, and other artifacts on demand.

Around that core, the workspace hosts **bots** — capability-holding p2p peers that can be addressed inline with `@bot:<name>` to receive instructions (e.g. _"Check status of @bot:foo"_, _"Tell @bot:foo to stop accepting users until Jan 15"_). Bots are not chat partners; they are programmable members with their own runtimes.

### Pillars

1. **Memory in, intelligence out.** The editor stores everything; the LLM transforms it.
2. **Dense by default.** Built for 14–16" laptops doing real work. Information per pixel matters more than whitespace.
3. **One UI system.** No more tapia-vs-soma split. Everything in `@soma/ui`, themed with Tailwind v4 + DaisyUI v5.
4. **Composable right area.** Not "a chat panel" — a stackable, splittable panel system. Chat is one panel; history, sub-pages, attached files, agenda, exercise queue are siblings.
5. **Multi-window for focus tasks.** Typing drills, exams, surveys open in lightweight popup windows so the user keeps working in the main window.

### Runtime ground truth (post-collapse)

The daemon and agent runtimes are no longer separate processes. Both ship as library crates (`soma-daemon`, `soma-agentd`) embedded in the `@soma/node` napi addon, loaded directly by the Electron main process. The renderer reaches the daemon via Electron IPC → main → napi → in-process Rust (`SomaHandle` / `DaemonHandle`). No gRPC, no UDS — see ADR-0001 (Superseded). This matters for v0 UX because:

- Calls are effectively synchronous from main's perspective; no socket round-trip to budget for.
- Streaming events from the daemon arrive via `ThreadsafeFunction` callbacks. Long-lived subscriptions (history feed, agenda, presence, bot handshake status) are cheap — the right-area panels can be live without paying gRPC stream overhead.

## 2. Mental model: LLM vs. Bots

| | LLM (assistant) | Bot |
|---|---|---|
| Role | Conversational productivity partner | Programmable peer with capabilities |
| Lives in | A right-area panel (chat) | p2p network, its own runtime |
| Added via | Space settings → "Connect assistant" | Space settings → "Add bot" |
| Addressed via | Direct chat in panel | `@bot:<name>` mention, in chat or document |
| Typical input | Free-form questions, document context | Instructions / commands |
| Typical output | Prose, summaries, generated content | Action ack, status, capability-bound side effects |

**Both are space members** under the existing capability model ([space-authorization-model.md](../../space-authorization-model.md)). UI distinguishes them; the auth layer doesn't.

## 3. Layout system

```
┌────────┬──────────────────────────┬──────────────────────────────┐
│        │                          │  Right area (panel stack)    │
│ Spaces │   Document (TipTap)      │  ┌────────────────────────┐  │
│  rail  │                          │  │  Chat (LLM)            │  │
│        │                          │  ├────────────────────────┤  │
│ ~52px  │   ~minmax(600px, 1fr)    │  │  History / metadata    │  │
│        │                          │  ├────────────────────────┤  │
│        │                          │  │  Sub-pages             │  │
│        │                          │  └────────────────────────┘  │
└────────┴──────────────────────────┴──────────────────────────────┘
                                       ~320–480px, vertically stacked
                                       OR horizontally split (2 cols)
                                       OR collapsed to icon strip
```

### Right area rules

- **Multi-panel container.** Each panel has: header (title, collapse, close, drag-handle), body, optional footer.
- **Stacking.** Default is vertical stack; user can drag a panel to split horizontally (max 2 columns inside the rail).
- **Pinning.** Panels are pinned to a space or to a document. Switching documents reflows; pinned-to-space panels persist.
- **Sources.** Panels can be opened by: assistant ("show history"), user (panel menu), automation (e.g. opening a doc with attachments auto-shows the attachments panel).
- **Collapse, not hide.** Collapsed panels become a vertical icon strip on the rail's right edge.

### Responsive behavior (editor stays the priority)

Width budgets, in order of degradation as the window shrinks:

1. **Comfortable (≥ ~1280px usable):** rail + editor + right area docked, multiple panels visible.
2. **Tight (~960–1280px):** docked right area collapses to icon strip; opening a panel slides it in as a **right-edge drawer with overlay** on top of the editor. Editor never compresses below its readable threshold.
3. **Very small (< ~960px or compact device):** right area enters **fullscreen-takeover** mode when summoned — editor is hidden under it, dismissing returns to editor. Main content priority = editor; panels only show on demand.

The same rules apply per-panel: a panel that wants to split horizontally only does so if the rail has the budget. Otherwise the split request stacks vertically instead.

### Density defaults

- Font sizes: **14px body**, **13px UI-sm** (row metadata, secondary text), **11px UI-xs** (labels, pills).
- Line-height: **1.5** for body, **1.2** for UI chrome. (Bumped from 1.45 after the refero pass — every dense product surveyed runs ~1.5 at 14px; 1.45 visibly compresses two-line metadata.)
- Spacing scale: extend Tailwind with `0.5` → 2px, `1.5` → 6px steps. Defaults to `2`–`3` spacing (8–12px) for component padding, not `4`–`6`.
- Row heights: **32px / 40px / 52px** tiers for dense / cozy / oversized lists.
- Shadows: **one token total**, reserved for modal + popup window only. Everywhere else use 1px borders + bg-step (DaisyUI `base-200` / `base-300`).
- Border radius: `rounded-md` (6px) max for surfaces; `rounded-sm` for chips/inline.

Concrete token table lives in [prd/ui-revamp-v0-refs-files-density.md §3](ui-revamp-v0-refs-files-density.md).

## 4. Flows to define (this PRD locks them)

Each flow gets a short subsection: trigger, steps, surface, success state. Drafts below; refero pass (step 2 of plan) feeds revisions before lock.

### 4.1 Create a space
_Draft._ Trigger: spaces-rail "+" button. Steps: name → privacy (local / shared) → done. No bots, no assistant yet — those are added from settings after creation. Success: routed to empty space with onboarding placeholder.

### 4.2 Configure a space
_Draft._ Single settings screen with **horizontal pill/underline tabs** under the page title: General · Members · Assistant · Bots · Sharing · Danger. Each tab is a single screen of sectioned cards.

**Save model — auto-save on blur, no global Save button.** Per-section Save buttons are banned. Errors surface inline under the field; success is silent (the value just persists). Explicit primary actions exist only for *initiation* (e.g. "Add backend", "Add bot") and *destructive* operations (Danger tab — see below).

**Danger zone** sits on its own card on the Danger tab, red-labelled. `Delete space` opens an inline slug-confirm form (type the space slug to confirm); the destructive button stays disabled until the typed slug matches.

See [prd/ui-revamp-v0-refs-space-lifecycle.md §2](ui-revamp-v0-refs-space-lifecycle.md) for the locked tab IA.

### 4.3 Add an assistant (LLM) to a space
_Draft._ Soma speaks the **Agent Client Protocol (ACP)** — the same protocol Zed uses — so any ACP-capable backend works: Ollama, LM Studio, Codex, and OpenAI-compatible endpoints via an ACP shim. ACP backends are managed by the embedded `soma-agentd` runtime; the renderer configures and selects them through the napi `SomaHandle`, not by dialing services directly. Settings → Assistant tab lists configured backends and lets the user add new ones (transport URL + auth). One backend can be marked default for the space; per-message override happens in the chat header (see 4.5).

### 4.4 Add a bot to a space — **v0 priority**

Bots are not discovered automatically. Whoever runs the bot reads its peer address and shares it out-of-band; the adder pastes it into space settings. RBAC controls who can do this — the owner may delegate bot-adding to non-owner roles, optionally constraining what capabilities they can grant.

_Draft._ Settings → Bots tab. List shows already-added bots with handshake status. "Add bot" opens a 2-step inline form:
  1. **Paste peer address.** Single input. UI validates format on blur. (Future: optional "import from clipboard" / QR scan.)
  2. **Grant capability.** Role is `Bot`. User picks scope (read/write per resource type — docs, messages, attachments), expiry, alias used in `@bot:<alias>` mentions. Sign + issue → daemon performs handshake + encryption + space-global registration. Status flips to `active` when the bot acks.

Errors surface inline at step 2 (handshake failure, signature reject) — no toast-only failures.

No floating modals. No multi-step wizard. Two visible steps, one save.

**Backend dependency.** The embedded daemon (in-process via `@soma/node`) must:
- Accept a "bot peer address" through the `SomaHandle` / `DaemonHandle` facade and run the handshake/encryption/registration round-trip.
- Expose `list_space_bots` (status + capability scope) for the settings UI.
- Enforce delegated bot-add authority based on the inviter's own capability (RBAC).
- Stream bot status updates over the existing event channel so the bots list stays live without polling.

It is not yet confirmed whether the daemon already persists registered bots per-space or exposes a handshake entry point — this is a v0 backend item to verify and complete in parallel with the UI work. The API additions live in [backend/crates/daemon/src/handle/](../../../../backend/crates/daemon/src/handle/) and surface through [backend/crates/soma-node](../../../../backend/crates/soma-node).

### 4.5 Chat with the assistant
_Draft._ Right-area chat panel. Input at bottom, messages scroll up. Slash menu for actions on current document. `@` opens a sectioned mention picker — Bots → Documents → Members, in that order. Bot mentions render as pills with a distinct icon and surface tint so the user sees at a glance that the mention will dispatch to a runtime, not the LLM.

**Backend switcher (composer footer, dense).** The active ACP backend sits as a chip in the **composer footer**, not the chat header: `<provider-mark> <name> ↕`. Click → dropdown with text labels lists configured backends; selection applies to the next message. The dropdown also surfaces "Add backend…" which deep-links to the Assistant settings tab. Header stays empty of provider chrome — saves vertical space and puts the control where the user's eye is when picking.

**Streaming.** Partial tokens render live. A `Thinking…` pill covers sub-first-token latency. While streaming, the composer's send button swaps to a solid round stop. After completion, a chip row appears under the message: `↻ Regenerate` · `Copy` · `…`.

### 4.6 Send an instruction to a bot
_Draft._ In chat (v0.1: also from documents): `@bot:foo do X`. The bot mention renders as a distinct pill. When the composer text begins with `@bot:`, the send button label flips to `Dispatch` and the left edge of the composer picks up the bot-mention surface tint — the user sees a different action is about to occur.

On send, the message routes to the bot's runtime (via the napi `SomaHandle`), not the LLM. Rendering in the thread:
- **User message** — text up to the `@bot:` pill in proportional face; instruction body wraps in monospace + `$` prefix to read as a command.
- **Dispatch ack** — collapsed pill between command and reply: `bot:foo · dispatched · <timestamp>`. Expandable on click to show ACP/handshake trace.
- **Bot reply** — bot-attribution pill in the message header; monospace for structured output, proportional for prose.
- **Failure** — same chat slot the response would have occupied, monospace + red surface tint, inline `Retry` chip + `Open bot status` link. No toast.

### 4.7 Open a focused popup task (10-finger typing)
_Draft._ From `/practice` exercise detail, "Open in window" → spawns a `BrowserWindow` with route `#/popup/typing/<exercise-id>`. Popup renders only [`CharDisplay`](../../../../desktop/desktop-ui/src/components/tapia/char-display.tsx) + input + minimal stats. Main window stays usable. Same mechanism will host future exam/survey popups.

**Popup chrome (locked).** 520×360 default, min-width 480px. Chrome auto-hides to a 28px drag strip on input focus. Glyph cluster on the drag region, flush-right: **pin** (always-on-top toggle, default off) · **restart** · **return-to-main** (closes popup + focuses main, leaves exercise state intact and resumable) · **close**. OS window title = the exercise's own name (not `Soma — Typing`) so the popup is identifiable in the dock / window switcher.

**Completion.** Popup closes → `app.focus()` on main + route to `/practice/<id>` → single toast `Exercise complete · WPM · accuracy · View result`.

### 4.8 Switch spaces / documents
_Draft._ Spaces rail = icons only (52px wide). Document tree lives _inside_ the document column header as a breadcrumb + tree popover, not as a third pane. Saves horizontal space.

### 4.9 Upload / attach a file
_Draft._ Drag into document or attachments panel. File type detected from content, not just extension (fixes the "ZIP archive" bug for .txt). Inline preview in attachments panel.

- **Drag overlay.** 2px dashed accent border on the entire document column (not per-block); single centered "Drop to attach" tile.
- **In-document attachment.** Chip-row: type glyph + filename + MIME + size + `×`. Two per row when width allows.
- **Attachments panel.** Dashed dropzone tile *above* the file list (never as the whole panel). Rows: 16px color-coded file-type glyph + truncated name + faint date subline + always-visible `⋯`.
- **Upload progress.** Inline bar baked into the row background; `n%` on the right; replaced by size on completion.
- **MIME mismatch.** Warning glyph + parenthetical detected type in the chip (`txt (detected) · 14 KB`), tooltip on hover. No toast.

## 5. What we're killing

- The tapia-specific UI components living inside `desktop/soma/src/renderer/src/routes/practice/components/`. Anything reusable migrates to `@soma/ui`; the rest dies.
- Global box-shadows.
- The current floating editor menu (replaced with a slash menu + selection bubble bar from `@soma/ui`).
- Buttons-everywhere space settings. Replaced by tabbed settings (4.2).

## 6. Component plan for `@soma/ui`

New / extended components, all built once for both `soma` and `practice` consumers:

| Component | Purpose | Status |
|---|---|---|
| `PanelContainer` | Right-area stack + split host | new |
| `Panel` | Header + body + collapse/drag-handle | new |
| `SlashMenu` | Editor command palette. Sections: Text · List · Embed · Action · Advanced. **No AI tile** — AI goes through the right-area chat panel, a slash AI block would be a redundant trap | new |
| `MentionPicker` | `@` autocomplete: Bots → Documents → Members. Keyboard-first | new |
| `SelectionBubble` | Inline formatting bar over editor selection. Single dark pill above selection; block-style dropdown leftmost | new |
| `BotList` | Bot list for space settings (status pill, capability scope, alias). _Renamed from `BotCatalogList` — there is no catalog; bots are added by paste_ | new |
| `CapabilityForm` | Identity / Scopes (collapsible groups with counts) / Expiry / Issue, one scroll surface | new |
| `BackendSwitcher` | ACP backend picker chip for the **composer footer** (was originally specced for chat header) | new |
| `PeerAddressInput` | Single-field paste + validate for bot adding | new |
| `SpacesRail` | 52px icon rail with active indicator | refactor |
| `CharDisplay` | Existing typing visual | keep, extract any inline styles |
| `DensityProvider` | Tailwind context for compact / cozy toggle | new |
| `Empty` | Empty-state primitive with three variants: **full** (icon + headline + optional CTA), **compact** (dashed-border single line, for narrow panels), **filter** (CTA is `Clear filter ×`) | new |
| `DenseRow` | Shared list-row slot model: `leading · primary(+sub) · status pill · meta · always-visible ⋯`. Used by members, bots, attachments, recent docs | new |
| `CommandPalette` | ⌘K modal: Recent docs (any space) → Spaces → Documents → Commands | new |
| `TreePopover` | Document-tree picker anchored under the last breadcrumb segment in the document column header | new |
| `PopupShell` | Reusable popup-window chrome (drag strip + glyph cluster: pin / restart / return-to-main / close). Hosts `CharDisplay` in v0; exams/surveys later | new |
| `SelectionAIBar` | Inline AI popover above selection — prompt input + categorized action list (Rewrite / Modify / Tone / Transform / Translate / Custom). Trailing chip on `SelectionBubble` opens it | new |
| `InlineAIAcceptBar` | `Accept · Try again · Refine… · Discard · Open in chat` bar anchored under inserted region after AI streams | new |
| `NodeAIRegistry` | Per-block-type AI action registry consumed by `SlashMenu`, `SelectionAIBar`, and the right-click block menu's `AI ▸` cluster | new |
| `InlineAIStream` | Streaming display primitive at the caret: accent underline + `Thinking…` pill + Stop chip. Region is `contenteditable=false` while streaming | new |

Detailed component specifications live in the locked patterns of the six refs docs ([overview](ui-revamp-v0-refs.md), [space lifecycle](ui-revamp-v0-refs-space-lifecycle.md), [assistant + bots](ui-revamp-v0-refs-assistant-bots.md), [editor](ui-revamp-v0-refs-editor.md), [files + density](ui-revamp-v0-refs-files-density.md), [popup window](ui-revamp-v0-refs-popup-window.md)).

## 7. Phased delivery

**Step 1 (this PRD).** Vision + layout + flows in draft. ← _you are here_
**Step 2.** Refero inspiration pass on: 3-pane Notion clones, stackable side panels (Linear/Height), inline mention pickers, capability-grant UIs. Findings appended as `prd/ui-revamp-v0-refs.md`.
**Step 3.** Flow drafts revised against refs, then locked.
**Step 4.** ADR-0005 captures the locked architectural decisions (right-area panel system, single-UI consolidation, popup-window mechanism, settings IA).
**Step 5.** Component scaffolding in `@soma/ui` (storybook stories for each new component before they ship to `soma`).
**Step 6.** Cutover in `desktop/soma`: replace screens one at a time, behind no flag — branch is the gate. Start with space settings (4.2 + 4.4) since "add a bot" is v0 priority.

## 8. Out of scope for v0

- The known bugs (scrolling, floating menu, shadows, .txt MIME detection). The revamp deletes the code paths that caused them; we won't separately fix.
- Density toggle UX (we ship dense; the toggle component is built but defaults to dense; cozy variant is post-v0).
- End-to-end encryption per space (mentioned as future work in space-authorization-model.md).
- Multi-window beyond typing popup. Architecture supports it; only typing ships in v0.

## 9. Resolved decisions

1. **Right area sizing.** No fixed max width. Adaptive collapse: docked → drawer+overlay → fullscreen takeover, depending on window width (see §3 _Responsive behavior_). Editor is the priority surface.
2. **Very small screens.** Panel fullscreen-takeover; editor hidden while a panel is active. Same component tree, different layout slot.
3. **Bot adding ≠ discovery.** Bots are added manually by pasting a peer address (see §4.4). RBAC governs who can add and with what scope. Daemon-side handshake + encryption + registration. **Backend item to verify:** whether `soma-daemon` already enumerates / persists registered bots per-space; if not, build it in parallel with the UI.
4. **LLM provider scope.** **Agent Client Protocol (ACP)**, same as Zed. Backends supported: Ollama, LM Studio, Codex, OpenAI-compatible (via ACP shim).
5. **Backend switcher lives in the composer footer**, not the chat header. Saves vertical chrome and puts the control where the user's eye is when picking a backend (§4.5).
6. **Settings auto-save on blur.** No global Save button anywhere in space settings; per-section Save buttons are banned. Errors surface inline (§4.2).
7. **Density: 1.5 body line-height, 1px borders, one shadow token.** Concrete numbers in §3 and the density refs doc.
8. **No AI tile in the slash menu.** AI goes through the right-area chat. A slash AI block would duplicate intent across surfaces (§6).
9. **`Empty` has three variants** (full / compact / filter); used everywhere instead of ad-hoc empty-state markup (§6).
10. **`DenseRow` is the single list-row primitive** used by members, bots, attachments, recent docs (§6).
11. **Popup windows have a reusable shell** (`PopupShell`) — drag strip + glyph cluster (pin / restart / return-to-main / close). v0 hosts `CharDisplay`; future exams/surveys reuse the shell (§4.7).

---

_This PRD is the source of truth until decisions are lifted into ADR-0005. Edit freely until lock._
