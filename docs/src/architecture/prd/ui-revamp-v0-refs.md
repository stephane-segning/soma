# UI Revamp v0 — Inspiration References

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md). Findings from a Refero pass against real product UIs. Each section maps to a PRD flow / component, calls out what to **borrow**, and what to **avoid**.

This doc is not a design — it's a kit of references for the lock pass that follows.

## 1. Three-pane workspace (PRD §3 layout)

### Borrow

- **Hello Ivy** ([screen b578cdd7](https://refero.design/pages/b578cdd7-1063-45c5-a26e-4a9cd6c9a750)). 52px icon-only spaces rail on the far left, a second narrow column for the page tree (Pages: Meeting notes / Pitch deck), then the document, then a contextual right panel ("Change design / Typography preview / Font family"). This is exactly the four-column shape we want. Notably the right panel is **single-purpose and contextual** — it appeared because the user invoked a typography action — rather than a permanent "chat pane". That matches our §3 panel-stack model: panels are slots, opened on demand.
- **Slab** ([screen 74b6ec78](https://refero.design/pages/74b6ec78-2918-478a-b293-b48ef0dfccc0)). Reference for the **collapsed** state of the spaces/pages rail: the entire left becomes a thin column of just-icons (search, menu) and the editor takes everything. Confirms our §3 "tight" mode is realistic, not aspirational.

### Avoid

- Hello Ivy chips: feature-card pills with `Archia / Basier Circle / Lato …` are nice but each chip is double-bordered (border + selection ring). We don't need both. Use a single-border resting state, then a fill on selected — keeps density.
- Slab's top action bar has `Saved · Editing · Read · Share · ⋯ · Publish` plus an avatar. Five separate controls for one workflow. We want this as a single split-button + overflow.

## 2. Right-area panel system (PRD §3 right area, §4.5 chat)

### Borrow

- **Rox** ([screen 438aaaec](https://refero.design/pages/438aaaec-9a74-4104-99a5-46ba8fececc5)). Closest match to our model. Left column is a chat/notes flow ("Five innovative ideas to improve the OpenAI project", with inline avatar-mention chips for Peter Welinder, Ryan Beiermeister, Rikki Gorman, Sanj Bhayro). Right column is a *contextual record* — "New Opportunity" with fields stacked vertically (Owner, Stage, Close Date, Associated People, Tags, Next Step). The two columns scroll independently and the right one has its own header (`OpenAI` + Overview / Account Report / Activity / Notes tabs).
- The Rox composer is a **single rounded input** with a small chip row beneath: `+ · OpenAI ↕ · Command can make mistakes`. The `OpenAI ↕` chip is the pattern we want for the §4.5 icon-only backend switcher — small, low-contrast, lives in the composer footer not a giant header bar.

### Avoid

- Rox's modal-on-top-of-side-sheet pattern (the "New Opportunity" sheet is essentially a modal pretending to be a panel). Our panels are **not modal** — they're independently usable surfaces.
- Two parallel scroll regions side-by-side with no visual divider — Rox relies on subtle bg shifts, but our denser layout will need a clear 1px divider, no shadow.

## 3. Mention picker (PRD §4.5, §4.6)

### Borrow

- The inline avatar-pill rendering in Rox: a mention renders as a tiny rounded pill with the avatar and name, slightly recessed background. We extend this for bots: `@bot:foo` should be a similar pill with a **bot mark** (different icon, slightly different surface) so users can visually distinguish bot mentions from user/doc mentions at a glance. This is critical because bot mentions cause command dispatch, not chat.
- The mention list pattern (across many screens we surveyed): sectioned by entity type, with avatar/icon + primary text + faint secondary text. Sections we need:
  1. **Bots** (most important — surfaces only this space's bots; bot mentions are routed to the bot runtime, not the LLM)
  2. **Documents** (pages within this space)
  3. **Members** (people in this space)
- Keep the picker keyboard-driven first. Arrow keys move within a section, then jump to the next section's first item. Esc closes.

### Avoid

- Slack's emoji-heavy mention rows. Our chat is for productivity, not banter — keep typography uniform.
- ChatGPT-style "@" chips in the composer that double as commands (`Search`, `Attach`). We want **two distinct surfaces**: a slash menu for editor/system commands, an @ menu for entity references. Don't conflate them.

## 4. Bot-adding flow — paste peer address (PRD §4.4)

### Borrow

- **Wise — Create an API token** ([screen f8fc84dc](https://refero.design/pages/f8fc84dc-b7cb-4284-bc24-a0a0f3611412)). Single screen, three fields total: name, two radio options for permission profile (`Full access` vs `Read only`, each with one-line subtext), and a single optional field (`Allowed IPs`). That is a great floor for our §4.4 step 2 (capability grant). It proves a credential issue UI can be *one screen, three fields*, not a wizard.
- **Appwrite — Key details** ([screen bed87b22](https://refero.design/pages/bed87b22-1d30-418e-b975-45daab6b1e5c)). Cards: Key details (Name, Expiration date, Last accessed, Secret), Name (editable), then Scopes block grouped by domain (Auth, Database, …) each collapsible with a "5 Scopes / 0 Scopes" counter. This is the right pattern when there are many possible scopes — grouped + counted + collapsed. Use it for our space-resource scopes (docs / messages / attachments / pages / etc.).

### Synthesis: our §4.4 inline form

- **Step 1** (paste): single oversized monospace text input, validate on blur, show parsed peer-id + alias preview underneath. Borrow the Wise pattern's tightness.
- **Step 2** (grant): Appwrite-style cards, all visible on one scroll surface:
  - **Identity** — peer id (read-only), alias used in `@bot:<alias>`
  - **Scopes** — collapsible groups (Documents / Messages / Attachments / Membership), each with `n granted of m` count; expand to see per-scope checkboxes
  - **Expiry** — date picker, with quick presets (7d, 30d, 90d, never if owner)
  - **Issue** — single primary action; surface handshake errors right above it, not in a toast

### Avoid

- Multi-step modals like Twitter "Pick a list" (we surveyed several variants) — they imply a catalog, but our bots **are not in a catalog**: every bot is identified by a peer address pasted by the inviter.
- Confirmation dialogs that ask the user to retype the bot name. We have signature + scope; redundant text entry just slows the path.
- Floating CTAs (Wise puts the create button bottom-right of the modal, fine for a modal; for our inline form the action belongs at the bottom of the scroll, not floating).

## 5. ACP backend switcher in chat header (PRD §4.5)

### Borrow

- **ChatGPT home composer** ([screen 874de703](https://refero.design/pages/874de703-27cd-4c0b-b06c-ed47dcace2b7)). Rounded composer with chip-style action buttons (`📎 Attach`, `🌐 Search`, `🎙 Voice`) inline. Surfaces affordances without taking vertical space. Use this aesthetic for our composer chips.
- The Rox composer's `OpenAI ↕` chip (mentioned above) is the **specific** pattern for the model picker — provider mark + chevron, opens a dropdown with text labels.

### Decision

The PRD says "icon-only with dropdown" in the chat *header*. Refero pass argues moving it from the header into the **composer footer** (Rox + ChatGPT both do this). The composer footer is where the user is looking when they decide which backend to send to. Moving it there removes a header element entirely. Recommend updating §4.5 in the lock pass.

### Avoid

- Bard/Gemini-style large model bar across the top of every message. Eats vertical space we don't have on 14" laptops.
- Pinning the picker to a global app header. The backend is a per-message decision; the control belongs near the input.

## 6. Capability/scope grant patterns reviewed but rejected

- **Pinterest business member dialog** — multi-step modal with role selection then permissions then send invite. We don't need this much ceremony; a peer-address paste isn't an email invite.
- **Doppler "Welcome to workplace" gradient onboarding** — heavy art direction, no relevance.
- **n8n dark sign-up form** — gives us no signal for in-app capability grants.

These are listed so the lock pass doesn't re-discover them.

## 7. Pattern locks (recommendations for ADR-0005)

| PRD ref | Pattern locked from refs | Reference |
|---|---|---|
| §3 layout | 52px icon spaces rail + narrow page-tree column + document + right panel-stack, with a per-panel header containing only a title + collapse + close (no shadow) | Hello Ivy b578cdd7 |
| §3 collapsed state | Spaces rail + page tree both collapse to a single thin column of icons in "tight" mode | Slab 74b6ec78 |
| §4.4 step 1 | Single oversized text input, paste peer address, validate on blur, show parsed identity preview underneath | (Wise minimalism applied to a peer-id paste) |
| §4.4 step 2 | Appwrite-style scoped cards on one scroll surface: Identity / Scopes (collapsible groups with counts) / Expiry / Issue | Appwrite bed87b22 |
| §4.5 backend switcher | Move from chat-header to composer footer chip: `<provider-mark> <name> ↕`, dropdown with text labels and "Add backend…" footer item | Rox 438aaaec composer |
| §4.5 mention pill | Tiny rounded pill with avatar/icon + name. Bots use a distinct icon + surface tint so users can see at a glance that a mention will dispatch to a runtime, not the LLM | Rox 438aaaec inline mentions |
| §4.5 mention picker | Sectioned: Bots → Documents → Members. Keyboard-first; arrow keys traverse cross-section; Esc closes | (cross-product convention) |

## 8. Open follow-up

- **Density tokens.** None of the surveyed UIs match the 14px-base density we want; most run at 15–16px. Our lock pass needs to settle on a token table independently. Survey of Linear / Height / Cursor (not in Refero today) is needed before the @soma/ui scaffold task.
- **Multi-panel split.** Hello Ivy and Rox both show a single right panel. We didn't find a clean reference for a *user-driven horizontal split inside the right area*. The closest analog is VS Code's editor groups — worth pulling once we start the `PanelContainer` component.
- **Typing popup window**. No useful Refero result for a small companion window adjunct to a main app. We'll design this against the constraint (always-on-top toggle, minimum size, no chrome past title bar) rather than from inspiration.

---

_Next pass after this lands: revise PRD §4.5 to move backend switcher to composer footer; update §4.4 step 2 wording to reference the locked scoped-cards pattern; then promote the locked rows above into ADR-0005._
