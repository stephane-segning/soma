# UI Revamp v0 — Assistant + Bot References (Deeper Pass)

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md). Follow-up to the first refs pass
([ui-revamp-v0-refs.md](./ui-revamp-v0-refs.md)), which already covered the four-column
layout, the bot-add 2-step inline form, the composer-footer backend switcher chip, and
the inline mention pill.

This pass goes deeper on the *assistant* and *bot* surfaces:

- §4.3 — Adding an ACP backend in space settings (transport URL + auth, default flag).
- §4.6 — Visually distinguishing a bot *command dispatch* from a chat message.
- §4.4 — Bot status indicators (`pending` / `active` / `failed`) and inline error surfaces.
- Streaming responses — tokens streaming in, stop / cancel / regenerate controls.

Keep the same rules as the prior pass: every recommendation is grounded in a real
product screen; sections lock to `### Borrow` and `### Avoid`; the table at the bottom
maps PRD refs to chosen patterns.

## 1. Adding an ACP backend (PRD §4.3)

Settings → Assistant tab. The user lists configured backends, adds new ones by entering
a transport URL + auth, validates inline, and marks one as default for the space.
AI-provider config screens and developer-credential screens are the strongest signal
here.

### Borrow

- **Linear — Create API key** ([screen 13f7be48](https://refero.design/pages/13f7be48-a227-412a-aa85-5544121d14ba)).
  Single-column form, dark mode, three blocks: `Key name` (single text input), `Permissions`
  with a "Full access" radio + "Only select permissions…" radio that expands into 5 named
  checkboxes (`Read`, `Write`, `Create issues`, `Create comments`, `Admin`), and a `Team access`
  block with a second radio + chip selector for teams. Footer is `Cancel` / `Create`. This is
  the exact shape we want for "Add an ACP backend": one screen, no wizard, the optional
  complexity (permissions / scopes) reveals only when the user asks for it. Apply it
  field-for-field to our backend form: `Name` · `Transport URL` · `Auth` (radio: none / bearer
  token / custom header) · `Mark as default for space` (single checkbox). Footer Cancel /
  Save. Nothing else.
- **Cursor — Dashboard → Integrations** ([screen 069970f5](https://refero.design/pages/069970f5-0a6f-4ebf-964a-3cbf1744de7d)).
  Reference for the *list state* once one or more backends are configured. Each row is a
  single horizontal stripe: provider mark (left), provider name + one-line subtext
  (`Connect <provider> for Cloud Agents, Bugbot and enhanced codebase context` /
  `Connected as 'referodesignteam' to repositories in GitHub organizations: referodesignteam`),
  and a right-aligned action button (`Manage ⌄` when connected, `Connect ↗` when not). The
  visual treatment alone tells the user the connected-vs-unconnected state — no colored badges
  shouting "ACTIVE" in green. We adopt this for our backend list: connected backends show
  `Manage ⌄` (with a sub-menu including "Mark as default", "Edit", "Remove"); unconfigured
  backends ship as templates (Ollama / LM Studio / Codex / OpenAI-compatible) with a `Configure`
  button until populated.
- **Fingerprint — Cloudflare integration detail** ([screen d60dbde8](https://refero.design/pages/d60dbde8-7ae3-4101-96dc-a33b4979675a)).
  Useful for the *single-backend detail* surface: provider header, a single `Status: Not
  Installed` (or `Connected`) pill directly under the title, then a long body of marketing/help
  text and a single primary CTA. We don't need the marketing prose, but the structure
  *title + status pill on its own line, then config below* is the right anchor for our backend
  detail view.
- **Default-flag pattern.** None of the reviewed screens express "default" with a separate
  control — they all use either a radio (one item only) or an inline pill next to the
  selected item's name. Settle on **a pill `Default` shown to the right of the backend name**
  in the list, set/unset from the row's `Manage ⌄` menu. A radio group across rows is wrong
  because the user may have *zero* defaults (per-message override only).

### Avoid

- **Manus connectors modal** ([screen fae7ea60](https://refero.design/pages/fae7ea60-633b-41f9-ae4d-1472b72f062c)).
  Centered modal with a 3×N grid of provider cards. This is a *picker for a catalog* and
  reads as "first choose, then configure" — two surfaces for one task. Our list is short
  (4–6 templates) and lives directly in the settings tab; no modal, no grid.
- Token entry fields rendered as plain `<input type=text>`. Even though ACP tokens for local
  Ollama are not real secrets, the affordance matters: always `type=password` with a reveal
  toggle on the right edge. Borrow this from any standard secret-input pattern; do not invent
  one.
- "Test connection" buttons that fire only on click. Validate the transport URL **on blur**
  (same rule the first refs pass locked for the peer-address paste in §4.4): parse, attempt
  an ACP `initialize` handshake, render the result *inline under the field* — green check +
  "Connected as <agent name / version>", or red message with the error. No toast, no modal.

## 2. Bot command dispatch in chat (PRD §4.6)

When the user writes `@bot:foo do X` in chat, the message must read as a *command* sent to
a runtime, not as a chat utterance. The response comes back as a bot-attributed message in
the same panel. The closest references in Refero are terminal-style command+response
pairings inside chat threads, and agent-detail screens that interleave commands with their
outputs.

### Borrow

- **Cursor — Agent detail** ([screen 5f4c68ff](https://refero.design/pages/5f4c68ff-da25-49e1-b7ba-6bcbf76a5ee6)).
  This is the strongest reference we found for *command dispatch in a chat-shaped thread*.
  The conversation thread interleaves model-attributed messages (`GPT-5.2 High`, `Opus 4.6`
  chips at the top of each block), code-diff blocks rendered as monospace gutters with
  syntax-highlighted lines, and **a terminal-style block** showing
  `$ cd /workspace && git add AGENTS.md && git commit -m "Add AGENTS.md ..."` followed by
  its output (`[cursor/agents-markdown-file-f408 db90c72] Add AGENTS.md with project
  conventions and guidelines / 1 file changed, 84 insertions(+) / create mode 100644
  AGENTS.md`) in the same monospace face. Lock this exactly for our bot dispatch:
  - The user's message containing `@bot:foo do X` renders with the body in the normal text
    face, **but the part after the mention pill is wrapped in a monospace span** with a
    leading `$ ` prefix (or similar disambiguator), styled at the same density as a code
    block. Visually: chat sentence on top, terminal-shaped command body beneath it.
  - The bot's response message renders with a `bot:foo` attribution pill in the header
    (distinct from user/LLM avatars — same icon set as the §4.5 mention pill), and the
    body uses a monospace face when the bot returns structured output (ack, status, list)
    and the proportional face when the bot returns prose.
- **Raycast AI — "Thinking…" expandable block** ([screen d3118a5e](https://refero.design/pages/d3118a5e-b48a-4a6b-b7d9-d0668641d05b)).
  When a model is working, Raycast renders a small dark pill labelled `Thinking… >` with
  the chevron indicating it can expand into reasoning detail. We adopt this for bot
  *dispatch acknowledgement*: between the user's command and the bot's reply, render a
  collapsed pill `bot:foo · dispatched · <timestamp>` that can expand to show the raw
  ACP/handshake trace if the user wants to debug. Default collapsed; one click reveals.
- **Composer "command mode" affordance.** When the composer detects a `@bot:` mention at
  the start of the message, switch the send button label from `Send` to `Dispatch` and tint
  the composer's left edge to match the bot-mention surface tint. Same input, different
  intent. Reference for the principle: Cursor's composer (same screen) shows
  `Add a follow up` with a small model-attribution chip below — the composer's footer reacts
  to the conversational state. We do the same with intent (chat vs. command) rather than
  with model selection.

### Avoid

- **ChatGPT-style "/" slash commands rendered as chips in the composer.** We've already ruled
  this out in the prior pass — slash is for editor/system commands. Commands to a bot go
  through `@bot:<alias>`, not `/`. Keep the mental model clean: `/` is local, `@` is a
  network entity.
- Rendering the bot's response with a giant header like Slackbot does ("`/dispatch` from
  user X to bot Y completed at 14:32:01 UTC"). We have the surrounding chat thread to anchor
  who sent what. The bot reply needs **only** an attribution pill + body.
- Treating the bot's "command failed" state as a normal chat error toast. If the dispatch
  fails (handshake dropped mid-flight, capability rejected, runtime panic), render the failure
  **inline in the same chat slot the response would have occupied** — same monospace face,
  red surface tint, with a `Retry` chip and an `Open bot status` link to the settings row.
  No floating toast.

## 3. Bot status indicators (PRD §4.4)

§4.4 says the bots list shows handshake status — `pending` / `active` / `failed`. Errors
must surface inline in the list, never as a toast. The strongest signal: developer-tool list
rows with status pills and last-seen timestamps.

### Borrow

- **Fingerprint integration detail** ([screen d60dbde8](https://refero.design/pages/d60dbde8-7ae3-4101-96dc-a33b4979675a)).
  Pattern: `Status` label on its own line under the title, followed by a single small pill
  (`Not Installed`). The pill is *boxy, neutral-bg, one word*, not a colored badge. We adopt
  the same boxy-pill aesthetic for our bot status:
  - `pending` — neutral pill (`base-200` bg), faint animated dot to the left to indicate
    in-flight.
  - `active` — neutral pill, solid green dot to the left.
  - `failed` — neutral pill, red dot, **followed by the failure reason as inline text on
    the same row**, e.g. `failed · signature rejected · 2m ago`.
- **Resend logs detail** ([screen cf561511](https://refero.design/pages/cf561511-960a-4de5-8eb5-5772d669db1c)).
  Reference for the *bot detail* surface (clicked from the list). The Resend log shows a row
  of labelled metadata cells across the top: `ENDPOINT` / `DATE` / `STATUS` (with a green
  `200` pill) / `METHOD` / `USER-AGENT` / `ID`. Adopt the same metadata strip for our bot
  detail header: `Alias` / `Peer ID` (truncated + copy) / `Status` (pill) / `Last acked` /
  `Capability expires` / `Issued by`. Below the strip: the granted scopes, and an
  `Activity` block (the bot's recent ack/error events) styled the same way Resend renders
  request bodies — dark monospace card with copy-to-clipboard. This gives admins one place
  to debug a bot without diving into logs.
- **Last seen / last acked timestamps.** Borrow the relative + absolute pairing common in
  developer tools: `2m ago` rendered as the primary, full ISO timestamp on hover. Pulled
  from cross-product convention; no single Refero screen owns this.

### Avoid

- **Cursor dashboard integrations** ([screen 069970f5](https://refero.design/pages/069970f5-0a6f-4ebf-964a-3cbf1744de7d)).
  Cursor uses descriptive sub-text instead of a status pill ("Connected as 'referodesignteam'
  to repositories in GitHub organizations: referodesignteam"). That works when there are 4
  possible integrations and the connect/disconnect is binary; it does *not* work for our
  list, where bots can be in 3 states *and* surface a specific error message. Don't merge the
  state into the description. Keep the pill, keep the inline error.
- Colored-background pills (green-bg `Active`, red-bg `Failed`). Too loud, fights the §3
  density rules. Neutral bg + colored dot is enough.
- Hiding errors behind a tooltip. The PRD explicitly forbids toast-only failures; we apply
  the same rule to tooltip-only failures.

## 4. Streaming responses (assistant + bot)

ACP backends stream tokens. The UI must show partial-message state, expose a stop-generation
control, and offer regeneration after the stream finishes.

### Borrow

- **Manus — generating-video chat thread** ([screen 413cdc41](https://refero.design/pages/413cdc41-3722-4b7a-b367-ebbbc5b88975)).
  Closest match to what we need. While the assistant is working, three things happen on
  screen at once:
  1. The in-progress message renders the partial body normally, with a `Generating video`
     inline status block (icon + "It will take a few minutes, please wait..." text + tiny
     spinner) sitting *within* the message.
  2. A small `Thinking` chip with an animated dot appears beneath the message.
  3. The composer's send button is replaced by a **solid round black stop button** with a
     white square glyph in the bottom-right corner of the composer. Same slot, swapped
     affordance. We adopt this verbatim:
     - While streaming: composer's right-edge primary becomes the stop button.
     - On click: cancel the stream, the partial message stays, a faint
       `stopped · <relative time>` line appears under it with a `Regenerate ↻` chip.
     - After stream completes: stop button swaps back to send; a row of three chips appears
       beneath the assistant message: `↻ Regenerate` · `Copy` · `…` (overflow with
       "Edit prompt" / "Branch from here").
- **Raycast AI — Thinking state** ([screen d3118a5e](https://refero.design/pages/d3118a5e-b48a-4a6b-b7d9-d0668641d05b)).
  When *no tokens have arrived yet* (initial latency before the first chunk), Raycast shows
  the dark `Thinking… >` pill in place of the message body. Adopt for our zero-token state:
  if more than 500ms passes with no first token, render a `Thinking…` pill in the message
  slot; replace it with the actual streaming body the moment the first chunk arrives.
  Caret/blinking cursor at the end of the partial body indicates the stream is live.
- **Stop = decisive, regenerate = optional.** The stop control must be *visible at all
  times while streaming* — borrowed from Manus's persistent stop button — because cancelling
  is the user's escape valve for runaway responses. The regenerate chip is post-stream only;
  cluttering the in-flight UI with regenerate would tempt double-dispatch.

### Avoid

- **ChatGPT's stop-button-where-the-send-button-was, *and* the streaming UI doubling the
  composer height.** ChatGPT in some states pushes a "Stop generating" pill *above* the
  composer in addition to swapping the button. Two affordances for one action. Pick the
  swapped-button pattern only (Manus does this cleanly).
- Showing the cursor as a typing animation that simulates per-character append when chunks
  actually arrive in larger batches. ACP delivers tokens, not characters; render whatever
  arrives, append it, blink a cursor at the tail. Don't fake typing.
- Hiding the regenerate affordance in an overflow menu. It's the second-most-common action
  after "copy". Surface it as a first-class chip.

## 5. Pattern locks

| PRD ref | Pattern locked from refs | Reference |
|---|---|---|
| §4.3 add-backend form | Single-column form (Name · Transport URL · Auth radio with progressive disclosure · `Mark as default` checkbox · Cancel/Save). One screen, no wizard. | Linear 13f7be48 |
| §4.3 backend list | Horizontal stripe rows: provider mark · name + one-line subtext · `Default` pill if applicable · right-aligned `Manage ⌄` (connected) or `Configure` (template). | Cursor 069970f5 |
| §4.3 endpoint validation | Validate on blur; render inline under field — `Connected as <agent name>/<version>` or specific error. No toast, no separate "Test" button. | (cross-product convention; matches the §4.4 paste-on-blur lock) |
| §4.3 default flag | Pill `Default` to the right of the backend name; set/unset from row menu; allow zero defaults. | (composite — not a single Refero screen) |
| §4.6 command body rendering | User message: text up to the `@bot:` pill in proportional face, body after it wrapped in monospace + `$` prefix. Bot reply: bot-attribution pill in header; monospace for structured output, proportional for prose. | Cursor 5f4c68ff |
| §4.6 dispatch ack | Collapsed pill between command and reply: `bot:foo · dispatched · <timestamp>`; expandable to show ACP/handshake trace. | Raycast d3118a5e |
| §4.6 composer intent shift | When composer text begins with `@bot:`, send button label → `Dispatch`; left edge tinted to bot-mention surface. | Cursor 5f4c68ff (composer footer reacts to state) |
| §4.6 failure rendering | Inline in the same chat slot the response would occupy: monospace face, red surface tint, `Retry` chip, `Open bot status` link. No toast. | (PRD §4.4 rule extended) |
| §4.4 status pill | Neutral-bg boxy pill + colored dot (`pending` faint animated, `active` solid green, `failed` red); inline failure reason on the same row. | Fingerprint d60dbde8 |
| §4.4 bot detail header | Labelled metadata strip — `Alias` / `Peer ID` (copy) / `Status` / `Last acked` / `Capability expires` / `Issued by` — over an Activity block in monospace card style. | Resend cf561511 |
| Streaming in-flight | Partial body renders live; `Thinking…` pill for sub-first-token latency; composer right-edge primary swaps to a solid round stop button. | Manus 413cdc41 + Raycast d3118a5e |
| Streaming post-flight | Below the completed assistant message: `↻ Regenerate` · `Copy` · `…` chip row. Regenerate is first-class, not overflow. | Manus 413cdc41 |

## 6. Open follow-up

- **Multi-backend per-message override UI.** §4.5 (locked in the prior pass) puts the
  backend switcher in the composer footer. With multiple configured backends + a default flag,
  the dropdown needs to show `Default` next to the marked entry, the others below, and an
  `Add backend…` footer item. None of the reviewed screens model exactly this (multi-backend
  *with* a default-flag concept) — confirm via a Storybook spike when we build
  `BackendSwitcher`.
- **Bot capability expiry warnings.** PRD §4.4 step 2 includes an expiry. We need a pattern
  for *"about to expire"* in the bots list (e.g. 7 days out): probably a yellow dot variant
  of the status indicator + "expires in 6d" inline text. Not covered above; settle when
  building `BotCatalogList`.
- **Token-cost / usage readout during streaming.** Some refs (Cursor agent detail, Parallel
  AI playground) show a tokens-used counter alongside the streaming message. Soma's v0 stays
  silent on cost — but the slot in the UI (post-message footer line, faint text) should be
  reserved so we don't have to refactor to add it.
- **Bot transcript export.** Resend's monospace metadata card is the right surface for
  showing a per-bot event log; we should think about a "Copy as JSON" button on each event
  row from day one, since bot debugging is a developer task.

---

_Next pass after this lands: fold the §4.3 add-backend form pattern + the §4.6 command
rendering rules into the PRD body; promote the status-pill + Activity-strip rows above
into ADR-0005 alongside the prior refs._
