# UI Revamp v0 — Editor AI Inspiration References

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md), the existing inspiration overview [ui-revamp-v0-refs.md](./ui-revamp-v0-refs.md), and especially [ADR-0005 §11](../adrs/0005-ui-revamp-v0.md). Findings from a focused Refero pass on **in-editor AI as a content-transformation surface**.

This is a **new, third editor surface** — not a contradiction of locked decisions. ADR-0005 §11 explicitly bars an AI tile from the SlashMenu (which inserts blocks) and PRD §4.5 anchors the LLM conversation in the right-area chat panel. Neither covers the case where the user wants to *act on existing content* — rewrite a selection, continue from the caret, summarize three blocks, caption an image. That is a transformation, not a conversation, and not a block insert. The pattern this doc lays out is what TipTap/Notion/Hashnode call **inline AI** (also "AI command" or "Ask AI"): a transient menu bound to a selection / cursor / node, with results that land directly in the document.

## 1. Selection-based AI action (PRD §4.5, ADR-0005 §11)

User highlights a span of text → invokes an AI action → result replaces or augments the selection.

### Borrow

- **Grammarly "GrammarlyGO" rewrite panel** ([screen ec09dfe8](https://refero.design/pages/ec09dfe8-a65a-4368-98cd-6bc034fb835d) and Flow [1875](https://refero.design/flows/1875)). User highlights a paragraph; a popover anchored just above the selection appears with the rewrite preview and a row of **tone chips** ("Shorten it", "Make it assertive", "Sound confident") under the primary `Insert` / `Rephrase` actions. The selection stays highlighted *behind* the popover the whole time — the user can see what is being acted on. This is the strongest concrete pattern for our selection-based action and matches our density goals.
- **Hashnode "Choose a prompt" dropdown** ([screen 26b8c405](https://refero.design/pages/26b8c405-ae00-4f40-96c2-5c0a6dfb05b0), Flow [3921](https://refero.design/flows/3921)). A single text input pinned at the top of the editor — `Choose a prompt or type a new one` — opens a categorized menu: **REWRITE** (Improve writing, Fix spelling and grammar, Rewrite as a single sentence, Simplify language), **MODIFY** (Shorten / Expand / Summarize / Explain), **TONE**, **TRANSFORM** (Turn into bullet list, numbered list). This sectioning is exactly the IA we need: it gives users keyboard-first access to ~5 canned actions per group, but the field is also a free-text prompt, which doubles as the "Custom prompt" affordance.
- **Cycle inline prompt bar** ([screen 40c12209](https://refero.design/pages/40c12209-e599-4220-a8a8-16f4e8168a88)). Shows the same pattern in a denser, action-bar form factor: `Continue writing · Shorten · Simplify · Spelling & Grammar · Emojify · Translate · Tone of Voice · Summarize`, all as 11-12px chips in a single floating bar. This is closer to our density target than Grammarly's larger card and is the right visual reference for the dense Soma version.

### Synthesis: SelectionAIBar component

Trigger: text selected → either (a) `⌘J` (or `⌘.`), (b) a small "Ask AI" chip appended to the right end of the existing [`SelectionBubble`](../adrs/0005-ui-revamp-v0.md#11-editor-surfaces-slash-menu-selection-bubble-block-menus), or (c) typing `/` *while a selection is non-empty* (existing slash menu transforms into an AI-action-only variant — same caret target, different intent). The bubble does **not absorb** these actions — it stays a formatting surface. The AI chip is the bridge between the two.

Surface: single rounded popover above the selection (selection stays visible behind it). Top row = text input with placeholder `Ask AI to edit or transform…`. Body = sectioned action list (Rewrite / Modify / Tone / Transform / Translate) keyboard-traversable. Bottom row = recently-used actions. ~14px input, 13px rows.

### Avoid

- **Grammarly's right-side AI assistant card** ([screen caceccf5](https://refero.design/pages/caceccf5-d1b4-4bed-aae6-4f1ef3e15fb5)). Pushing the suggestion into a permanent right-side panel collides with Soma's existing chat panel and re-introduces the "everything goes in a side sheet" trap. The Grammarly popover *above the selection* is the right move; their full side panel is not.
- Floating round "AI" buttons that hover next to every paragraph (Notion's hover-rail AI). Too noisy on 14" laptops; we already use the left gutter for drag + insert, and adding a third icon there is over-budget.
- ChatGPT-style "send to chat to rewrite this" flows. Conversation is the wrong shape for "make this one paragraph shorter."

## 2. Cursor-position AI (PRD §6 SlashMenu, ADR-0005 §11)

Empty caret → user invokes → AI writes new content at the caret.

### Borrow

- **Hashnode prompt input on empty caret** (same Flow [3921](https://refero.design/flows/3921)). When no selection exists, the same `Choose a prompt or type a new one` field becomes a *generation* prompt rather than a *transformation* one. Same menu, different default action set: REWRITE is hidden, **Continue writing**, **Brainstorm ideas**, **Outline a section**, **Summarize document** become the primary entries. This proves the same surface can serve both selection and caret with conditional content.
- **Slite editor `/` AI prompt** ([screen 345c7168](https://refero.design/pages/345c7168-a3ca-415b-9596-ebef6e6ce837)). Slite uses an "ask AI" prompt at the top of the slash menu *as a search field*, not a tile. Typing `/` opens block options; typing `/ <free text>` and pressing Enter dispatches the free text to AI. This sidesteps the ADR-0005 §11 ban (no AI **tile**) while still letting `/` be the invocation key. We can adopt this with a clear visual divider: the field on top is *AI prompt*, the rows below are *block inserts*, and the two never collapse into one list.

### Synthesis: how this slots into the locked SlashMenu

ADR-0005 §11 says the slash menu has no AI tile. We hold that lock. **What we add** is a header row above the existing Text/List/Embed/Action/Advanced sections: a single input row that, when the user types anything other than a block name, transforms the popover into an inline-AI prompt (loses the section list, shows recent prompts + "Continue writing" / "Brainstorm" / "Custom prompt"). If the user presses `↓` or types a known block label, it's back to block-insert mode. This is **one surface, two modes** — not a duplicate AI tile.

For users who don't want to lean on `/`, the same surface is reachable via `⌘J`. Keyboard-first; no floating button cluttering the gutter.

### Avoid

- A second slash command like `/ai` or `++` that opens a different popover. ADR-0005 §11 explicitly warns against duplicate AI invocation paths; we keep one.
- Auto-suggested ghost text on every empty paragraph (Notion's old behavior, since toned down). Too noisy, and impossible to reconcile with offline-first / local-first model loading delays we expect.

## 3. Block-level AI on non-text nodes (new — extends PRD §4.9, §6)

Right-click or hover on an image / table / code block / embed → AI action available on that specific node.

### Borrow

- **Medium "Alternative text" modal** ([screen 9763cb47](https://refero.design/pages/9763cb47-b166-4e1c-87f6-e5c7938bf54b)). Centered modal over a dimmed page: title `Alternative text`, single-line description `Write a brief description of this image for readers with visual impairments`, the image preview, a single input pre-filled with a generated placeholder (`E.g., An antique typewriter with a blank sheet of paper sits on a wooden desk`), and `Save` / `Cancel`. We borrow the structure but flip the workflow: rather than the user writing alt and AI being a hint, we open the modal **with the AI-generated alt already filled in**, and the user accepts or edits. This is one click cheaper.
- **Raster auto-generated image descriptions blog** ([screen 7f4af06b](https://refero.design/pages/7f4af06b-7539-400d-b63c-8d1bac6907eb)). Confirms the product framing: per-image AI generates a description on demand, stored on the asset. We get the framing and copy patterns from this, not the UI.
- **Per-node AI menu pattern (cross-product convention).** Right-click on an image in Notion / Coda exposes a node-typed submenu: for images, "Generate alt text", "Describe", "Caption"; for tables, "Analyze", "Summarize columns", "Find outliers"; for code blocks, "Explain", "Refactor", "Add comments"; for embed/sub-page nodes, "Summarize linked page". The right-click menu (already locked as the per-block menu in ADR-0005 §11) is the natural home — we add an `AI ▸` section above the standard `Duplicate` / `Move to` / `Delete` cluster, with node-type-specific entries.

### Synthesis: node-typed AI sections

Each node type registers its own AI submenu. The slash AI prompt and the SelectionAIBar reuse the same action registry — image nodes contribute `generate-alt-text`, `caption`, `describe-for-search`; code nodes contribute `explain`, `refactor`, `find-bug`; etc. This is what makes "block-level AI" not a one-off feature but a system: every block knows what it lets the AI do to it. Component-wise, this becomes a `NodeAIRegistry` on the `@soma/ui` editor primitives.

### Avoid

- A separate right-area panel for image alt-text. Overkill — alt text is a one-line field on the node, not a conversation.
- Hovering image → showing an inline "AI" floating button on the corner of the image. Visual noise; the right-click menu already exists and is locked.

## 4. Accept / reject / regenerate UX (new — anchored against ADR-0005 §11)

After AI writes into the document, the user needs to accept, reject, refine, or try again.

### Borrow

- **Hashnode "Improve writing" preview modal** ([screen 988c1f37](https://refero.design/pages/988c1f37-82f5-4ebb-a222-22d5527b29bc), Flow [3921](https://refero.design/flows/3921) step 6). The clearest reference. After the user picks an action, a small modal centered over the document shows:
  - Header: action name (`Improve writing`) + close `×`
  - Body: the generated paragraph in a single readable block (no diff yet — just the result), with the original selection still highlighted *behind* the modal
  - Footer: `Regenerate` (secondary, grey) on the left, `Accept` (primary, blue) on the right
  This is a great floor because it's tiny, decisive, and never blocks the user from reading the original (the modal is small enough that the highlighted span shows underneath). The "no diff yet" choice is the right one for v0 — diffs come later (see open follow-up).
- **Grammarly multi-variant card** ([screen 2d41f4dc](https://refero.design/pages/2d41f4dc-ade4-4583-8f4b-963a75aab3a8)). Shows two-three alternate rewrites in a stack with `Insert` on each, plus a `Tell us to…` refinement field at the bottom of the card. This is the pattern we want for the **"refine" affordance**: instead of regenerating blindly, the user can type "make it shorter" and the same card updates. We borrow that footer-input pattern.

### Synthesis: in-place result with action bar

When the user invokes inline AI:

1. **Pending state.** The selection (or insertion zone) gets a tinted background (`base-300` step + 1px dashed `accent` border — borders not shadows per ADR-0005 §7) and the new text streams in. Original text stays underneath, semi-transparent at 40% opacity, so the user can read both.
2. **Result state.** Once streaming finishes, a single dense action bar appears anchored to the bottom of the inserted region: `✓ Accept` · `↻ Try again` · `✎ Refine…` · `✕ Discard`. `Refine…` reopens the prompt input pre-filled with the previous prompt for one-tap edit. `Try again` re-runs the same prompt.
3. **Accept.** Original is dropped, AI text becomes plain document text, the bar closes.
4. **Discard.** AI text is removed, original returns to full opacity.

This avoids the multi-modal stack Hashnode uses (modal on top of editor) and stays in the document, which matches Soma's density rules.

### Avoid

- A diff view with red/green strikethrough as the default (Cursor / Copilot Chat). Powerful for code, but visual overload for prose — and our editor is prose-first. Move it to an opt-in "diff mode" post-v0.
- Toast-only feedback ("AI suggestion ready, click here to view"). Banned by ADR-0005 §6 for primary actions; inline AI is a primary action.
- A separate "history of AI rewrites" sub-panel. Overkill for v0; the chat panel already keeps a transcript if the user routed through it.

## 5. Streaming-into-document UX (new — extends PRD §4.5 streaming)

The chat panel already handles streaming in conversations (PRD §4.5: `Thinking…` pill, partial tokens, stop button). The in-editor case is different because tokens land *in the document itself*.

### Borrow

- **Grammarly "Working on it…" state** (Flow [1875](https://refero.design/flows/1875) step 3). While generating, the card shows a skeleton with a pulse animation; the existing selection stays highlighted; the rest of the document stays interactive (the user can scroll, just not edit the in-flight region). This is the right baseline: lock the inserted region, leave everything else alone.
- **Hashnode "Continue writing"** (in [40c12209](https://refero.design/pages/40c12209-e599-4220-a8a8-16f4e8168a88)). Streaming text appears one paragraph at a time, with the cursor at the trailing edge of the streamed content; a small `Stop` chip appears just below the in-flight region.
- **Reuse the chat panel's `Thinking…` pill** (locked in PRD §4.5) for the pre-first-token state at the caret. Same component, anchored to caret instead of chat.

### Synthesis: streaming chrome at the caret

- **In-flight tint.** Streamed tokens render with the `accent` color text and a 1px dashed `accent` underline (no full background tint — we want the user to read the prose). The region is `contenteditable=false` until streaming completes.
- **Pre-first-token.** Replace caret blink with the `Thinking…` pill (same chip as chat panel) inline at the insertion point. Width animates from 0 → fit-content. No spinner — the pulse on the pill is sufficient.
- **Stop control.** A solid round stop button sits at the end of the in-flight region (mirrors the chat panel's composer stop, ADR-0005 / PRD §4.5). One control, one place to look.
- **Post-streaming.** Underline fades over 200ms; text snaps to normal color; the accept bar appears (see §4 above).

### Avoid

- Solid background tint for streamed text (reduces readability while it's streaming).
- A spinner overlaying the editor. The `Thinking…` pill is enough.
- Letting the user keep typing in the in-flight region. Race conditions and lost edits. Lock it.

## 6. Relationship to the chat panel (PRD §4.5)

This is the design call the lock pass most needs to make. The options:

| Option | What it means | Verdict |
|---|---|---|
| **A. Inline AI replaces chat for transformations** | All AI on existing content goes through SelectionAIBar / caret prompt. Chat is for free-form Q&A only. | Too clean; loses the "summarize this doc into a chat thread" use case. |
| **B. Inline AI complements chat — full silo** | Inline AI never talks to chat; chat never sees inline rewrites. Two tracks. | Simple but throws away history — users can't go back and see what they rewrote three days ago. |
| **C. Inline AI is a pre-fill bridge into chat** | Selecting text + invoking AI opens a transient prompt above the selection, but every action is *also* recorded as a turn in the right-area chat panel. The chat panel is the audit log; the inline surface is the input + output. | **Recommended.** |

### Recommendation: Option C — bridge with optional escalation

Default flow:

1. User selects text, presses `⌘J`. Inline prompt appears above selection.
2. User picks "Make shorter" (or types a custom prompt).
3. AI streams into the document; inline accept bar appears.
4. **In parallel**, a collapsed chat turn is appended to the chat panel: `<doc-ref pill> → Make shorter` with the result. The user doesn't see this unless they look — it's collapsed by default.
5. If the user wants to iterate further ("now make it 3 bullets"), they can either:
   - Use the inline `Refine…` action (cheaper, stays in document), or
   - Click "Open in chat" on the inline accept bar (expanded interaction, full conversation with the rewrite as context).

This gives us:
- **Inline AI for the 80% case** (fast, in-document, no panel context switch).
- **Chat panel for the 20%** when the rewrite becomes a conversation (compare drafts, branch, dig deeper).
- **One audit log** for both, anchored in the locked chat panel.

The chat panel does not need a new mode for this. The new chat-message type is just `inline-edit`, rendered as a small folded pill instead of a normal message bubble.

### Avoid

- Always opening the chat panel for any inline AI invocation. Defeats the speed gain.
- Never recording inline AI activity anywhere. Users lose the ability to reconstruct what they edited.

## 7. Pattern locks (recommendations for ADR-0005 addendum)

| PRD ref | Pattern locked from refs | Reference |
|---|---|---|
| §6 new component | `SelectionAIBar` — popover above selection, top input + categorized action list (Rewrite / Modify / Tone / Transform / Translate / Custom prompt). Density: 14px input, 13px rows. | Grammarly ec09dfe8, Hashnode 26b8c405, Cycle 40c12209 |
| §6 new component / §11 amendment | Inline AI invoked via `⌘J`, the "Ask AI" chip on the SelectionBubble, OR `/` + free text (SlashMenu's existing input row, gated on no block-name match) | Slite 345c7168, Hashnode 26b8c405 |
| §6 new behavior | Caret AI uses the same SlashMenu popover, but with a *generation* action set (Continue writing / Brainstorm / Outline / Summarize document). No new tile; conditional content. | Hashnode flow 3921 step 2 |
| §6 new system | `NodeAIRegistry` — every block type registers AI actions, exposed in the right-click block menu under an `AI ▸` cluster (above the existing Duplicate / Move / Delete cluster) | Medium 9763cb47, Raster 7f4af06b |
| §6 new behavior | Accept / Try-again / Refine / Discard bar anchored under inserted region. No diff view in v0. Refine reopens the prompt input pre-filled. | Hashnode 988c1f37, Grammarly 2d41f4dc |
| §4.5 extension | Streamed tokens get accent-colored text + dashed accent underline. Region is locked while streaming. Stop chip at trailing edge. `Thinking…` pill (reused from chat) for pre-first-token. | Grammarly flow 1875 step 3 |
| §4.5 extension | Every inline AI invocation appends a collapsed turn to the chat panel as audit log. Inline accept bar exposes `Open in chat` for escalation. | (synthesis; no single screen) |

## 8. ADR-0005 addendum proposal

**Recommendation: amend ADR-0005 with a new §13 decision, and reference it from §11.** A single new component slot in PRD §6 is *not* sufficient — inline AI changes how three existing surfaces (SlashMenu, SelectionBubble, block menus) behave, plus introduces a streaming-into-document state and a cross-surface audit-log convention. That is the threshold for an ADR-level decision, not just a component.

### Proposed wording

**Amend §11** to add a final paragraph:

> Inline AI is a third editor surface alongside SlashMenu and SelectionBubble — see §13. SlashMenu still has no AI tile (ADR lock); instead, the SlashMenu's leading input row doubles as the AI prompt entry when the typed text does not match a block name. SelectionBubble grows a trailing "Ask AI" chip that opens the SelectionAIBar; the bubble itself remains a formatting surface. Block menus (right-click) gain an `AI ▸` cluster fed by the per-node-type AI registry.

**Add §13 "Inline AI as a content-transformation surface"**:

> Inline AI is a transformation surface bound to a *selection*, *caret position*, or *node* — distinct from the conversational chat panel (§4.5) and from the block-inserting SlashMenu (§11). It is invoked by `⌘J`, by the trailing chip on the SelectionBubble, by the SlashMenu input row when not matching a block name, or by the `AI ▸` cluster in a node's right-click menu. Results stream into the document at the invocation site; a single accept bar (`Accept` · `Try again` · `Refine…` · `Discard`) closes the interaction. While streaming, the affected region is non-editable and renders in the accent color with a dashed accent underline; a `Thinking…` pill (same component as the chat panel, §4.5) covers the pre-first-token window. Every inline AI invocation appends a collapsed turn to the chat panel as audit log, and the inline accept bar exposes "Open in chat" for escalation into a full conversation. No diff view, no per-paragraph hover AI button, no separate `/ai` slash command — one surface, three invocation paths, one accept bar.

### Proposed PRD §6 component additions

| Component | Purpose |
|---|---|
| `SelectionAIBar` | Inline AI popover above selection — prompt input + categorized action list |
| `InlineAIAcceptBar` | Accept / Try-again / Refine / Discard anchored under the inserted region |
| `NodeAIRegistry` | Per-block AI action registry consumed by `SlashMenu`, `SelectionAIBar`, and the right-click block menu |
| `InlineAIStream` | Streaming display primitive: accent underline + `Thinking…` pill + Stop chip |

## 9. Open follow-up

- **Diff mode for code blocks.** Inline AI on a code block almost certainly needs diff output (red/green) like Cursor / Copilot. Out of v0 scope but the `NodeAIRegistry` should be designed so a code node can swap the accept bar for a diff variant later.
- **Multi-block selection.** Selecting across blocks (e.g. three paragraphs + a list) and asking AI to summarize is the strongest "reduce" use case but visually the trickiest — the inline accept bar's anchor point is ambiguous. Defer to v0.1; for v0, multi-block selection routes to the chat panel ("Open in chat" path) rather than inline.
- **Local model latency.** Inline AI's "no panel context switch" speed promise depends on first-token-time. With local Ollama backends the latency may be punishing. The `Thinking…` pill is the budgeted slot, but if backends commonly hit > ~1.5s pre-token, we may want a different invocation gate — e.g. requiring an explicit ⌘Enter to start rather than auto-streaming on action pick. Decision deferred to integration testing.
- **Refero coverage gaps.** No clean reference exists for the *node-typed AI registry* pattern; we synthesized from Medium's alt-text modal + Raster's image-description product + general right-click-menu convention. Worth revisiting once Cursor / Notion add more public node-typed AI patterns.
- **`⌘J` collision check.** Confirm `⌘J` isn't already bound by the OS or another Soma surface before locking. Fallback: `⌘.` (Cursor's binding).

---

_Next pass: promote §7 pattern locks and §8 addendum wording into ADR-0005 §11 (amendment) + new §13. Component scaffolding for `SelectionAIBar`, `InlineAIAcceptBar`, `NodeAIRegistry`, `InlineAIStream` follows the existing storybook-first cadence in PRD §7 step 5._
