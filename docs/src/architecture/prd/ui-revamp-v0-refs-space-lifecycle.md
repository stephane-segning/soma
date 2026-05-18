# UI Revamp v0 — Inspiration References: Space Lifecycle

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md) and [ui-revamp-v0-refs.md](./ui-revamp-v0-refs.md). This pass covers the three flows the earlier refs doc deferred: creating a space (§4.1), configuring it (§4.2), and switching between spaces / documents (§4.8).

Same format as the original refs doc — references by refero UUID, no images embedded.

## 1. Create a space (PRD §4.1)

Trigger is the spaces-rail "+" button. PRD locks the flow to **name → privacy (local / shared) → done** as a single screen, not a wizard, with no assistant or bot setup at create time.

### Borrow

- **Loom "Create a new Space"** ([screen e3c99d85](https://refero.design/pages/e3c99d85-7919-40ca-95eb-0723f86cad78)). One centered modal with three labelled blocks (Name / Members / Privacy) and a single primary `Create Space` button alongside `Cancel`. The Privacy block is the exact pattern we want: two radio rows, `Open — Anyone at My Workspace can join` and `Closed — Only invited people can join`, each with a one-line subtext explaining the consequence. Map this 1:1 to our `Local — Only on this device` / `Shared — Visible to invited peers`. The descriptive subtext does the job of an info icon without one.
- **Copy.ai "Create Teamspace"** ([screen 60b58b03](https://refero.design/pages/60b58b03-3fd2-4004-af82-607b96097c79)). Same essential shape but tighter: name field at top, "Team privacy" header below, two radio rows `Public — Anyone can join` / `Private — Only people invited can join`. No members field at create time — defer membership to settings. This matches the PRD's "no bots / no assistant at create" — Copy.ai proves the trim works.
- **Loom omission worth borrowing.** Loom puts members in the create modal as a free-text "Enter names" field. We should *skip* this in v0: invitations require a peer-address paste, which is too heavy for an "I'm spinning up a quick space" flow. Match Copy.ai's restraint.

### Avoid

- **Framer "Create a new workspace"** ([screen fc799b45](https://refero.design/pages/fc799b45-8c9f-4b8b-b89c-2388082c26bb), [7976359d](https://refero.design/pages/7976359d-ae0f-4b6a-89d3-e12a80b8eebe)). Step indicators at the top of a centered modal for a 2-step new-workspace flow. Two steps is one step too many for our case — the PRD says single screen, and the radio pair already covers privacy without a second page.
- **Savee "New Board"** ([screen 3395e1ce](https://refero.design/pages/3395e1ce-741f-4ed9-b2ea-d65a7b64fbc7)). Drop shadow on the modal, image-upload prompt inline. We don't have global shadows and don't want avatar/icon decisions at create time. The space icon can default to an initials chip (re-used from the rail) and be edited later in settings.
- **Pitch "Workspace name" with avatar tile** (visible in the background of [screen 80261480](https://refero.design/pages/80261480-1a56-490c-b070-bd06e5955638)). Same problem — gradient avatar tile at top of the create form invites the user to pick a color before they've named the space. Defer all decoration.
- **Pinterest-style multi-step "Create a list"** flows reviewed across results — same wizard objection raised in the existing refs doc (§6). Reject again here.

### Synthesis: our §4.1 create-space modal

- One centered modal, no step indicator, no shadow (1px border + `base-200` background per §3 density rules).
- Fields, top to bottom:
  - **Name** — single text input, autofocus, no placeholder beyond `Untitled space`.
  - **Privacy** — two radio rows, `Local — Only on this device` / `Shared — Visible to invited peers`, each with a one-line subtext. Default to `Local` to match the local-first thesis.
- Footer: `Cancel` (ghost) + `Create space` (primary). No "Create and open" split — opening is the only success path.
- Success: modal closes, the new space's icon appears in the rail with a brief outline pulse (1s) to confirm where it landed; the document column shows an empty-state placeholder ("Add your first page"). Not an onboarding tour.

## 2. Configure a space (PRD §4.2)

Tabs: General · Members · Assistant · Bots · Sharing · Danger. PRD constraint: at most one primary action per tab, no floating CTAs.

### Borrow

- **Linear workspace settings** ([screen 79ca4f83](https://refero.design/pages/79ca4f83-09ec-45a4-8905-6434488cfde7)). Best end-to-end reference. Vertical left rail groups settings into `Account` / `Workspace` / `Features` / `Integrations`. Main column has sectioned cards (`Workspace`, `Time & region`, `Danger zone`). Each section card has its own primary control: the field input is the action — auto-save on blur. **Danger zone** is a single row inside its own card: short label + sentence ("Delete workspace / Schedule workspace to be permanently deleted") with the destructive action rendered as red link-styled text on the right, NOT a filled red button. This is exactly the restraint we want.
- **Attio workspace settings** ([screen 2f1fe188](https://refero.design/pages/2f1fe188-d2bd-4928-8ace-055810c059ab)). Same IA shape as Linear (left rail with `Account` / `Workspace` / `Data` / `Reports` groups). What it adds: the delete confirmation requires the user to **type the workspace slug** plus a "Reason for deleting" field, with the primary `Delete workspace` button disabled (pink/faded) until the slug matches. Borrow the slug-confirm gate verbatim for our `Danger` tab — it forces an intentional motion without a separate "are you sure" dialog.
- **Pitch workspace settings** ([screen 80261480](https://refero.design/pages/80261480-1a56-490c-b070-bd06e5955638)). Reference for the **labelled "Danger zone" header in red**, with the destructive action as a red filled button on the far right of a list row. The label "Danger zone" itself reads in red, which we should borrow — it's a stronger visual signal than the muted label Linear uses, and we don't lose anything from making this section's heading red since it appears only once on one tab.
- **Factory.ai settings** ([screen 7934f954](https://refero.design/pages/7934f954-dd3d-4cd0-9807-8536c1fc607f)). Reference for **horizontal pill-tab IA** instead of a left rail — `General · Integrations · Session · API Keys · Billing & Usage` centered under a page title, with the active tab a filled pill. Below it: section cards (`Local Repositories`, `Factory Bridge`, `Remote Workspaces`) each with one primary action max (`edit`, toggle, `Create Workspace`). This is the layout closer to what our PRD asks for — our Space settings is *per-space*, not a global IA, so the breadcrumb is already the space; we don't need a second left rail. Use horizontal tabs.
- **Kinhive settings** ([screen 8307bc81](https://refero.design/pages/8307bc81-571f-4721-abe3-d43a05090f30)). Smaller-scale confirmation of the same idea: `Profile · Prompts · Account · Notifications · Billing` as a flat horizontal sub-nav under a single "Settings" h1, with the active tab underlined. Toggle rows auto-save inline — no Save button. Reinforces auto-save-on-blur as the v0 default.

### Decision: tabs are horizontal, not a left rail

Linear and Attio use a left rail because their settings span account-level *and* workspace-level concerns — they need the grouping. Our Space settings is single-context (one space), so the left rail would just be a six-item vertical list eating ~200px to no purpose. Factory.ai and Kinhive both use a horizontal pill/underline tab strip for the same single-context case. Adopt horizontal tabs.

The PRD §4.2 wording ("Tabs: General · Members · Assistant · Bots · Sharing · Danger") already implies horizontal — this just confirms it against references.

### Save model: auto-save with inline error, no global Save button

Linear and Kinhive both auto-save on blur. Toast-on-success is muted (or absent). Failures appear inline next to the field. Adopt this. The only explicit-save case is the **Danger tab's `Delete space`** — destructive actions need the slug-confirm gate, never auto-save.

### Avoid

- **Cursor "Privacy Settings" modal-on-page** ([screen 33c42658](https://refero.design/pages/33c42658-b8ed-47d5-86bf-ab702d4b24a6)). Settings page with a *modal on top of it* to edit a single setting. Two layers of chrome to flip one toggle. Our settings tabs are the surface; never spawn a modal to edit a field inside them.
- **Doppler workplace settings** ([screen d8c20153](https://refero.design/pages/d8c20153-3f8c-4f2f-bf8b-b2a19897c1af) — observed in dark variant [075178eb](https://refero.design/pages/075178eb-5aff-46fb-820d-7a63f9665f36)). One long unsectioned scroll of mixed concerns — Members and Plan and Billing and SCIM all stacked. The sectioning by *tab* the PRD calls for is exactly what's missing here. Don't regress to "everything on one page".
- **Per-section "Save" buttons.** Rive's account settings ([screen b9d7c9de](https://refero.design/pages/b9d7c9de-f4dd-43c5-9ce7-2df8572ea779)) and several Doppler screens use per-card `Save` buttons. Multiplying primary buttons across the page is exactly the "buttons everywhere" anti-pattern the PRD rejects. Auto-save the input; if a section genuinely needs a multi-field atomic save (e.g. peer-address add — already handled in §4.4), the action goes at the bottom of that section's *form*, not on the section card chrome.
- **Floating bottom-right CTAs** ("Save changes" floating bar that slides in). Linear and Attio both demonstrate this is unnecessary if you auto-save. Skip it.
- **Avatar/icon upload in the General tab as the first card.** Pushes name/URL below the fold. Put identity fields (Name, URL/slug, optional icon) first in a single card, icon as a small inline edit chip not a giant upload tile.

### Synthesis: our §4.2 tab IA

| Tab | Primary content | Single allowed action |
|---|---|---|
| General | Name, icon (inline), description, locale | inputs auto-save on blur |
| Members | List of people in this space with role pill; one row per member | `Invite member…` opens a peer-address paste form below the list (same form pattern as bot adding, §4.4) |
| Assistant | Configured ACP backends; default backend selector | `Add backend…` opens inline form |
| Bots | Locked from existing refs doc — Appwrite-style scoped cards | `Add bot` (already specified) |
| Sharing | Per-space sharing toggles + link policy (read-only in v0 if no public sharing yet) | `Generate share link` or auto-save toggles |
| Danger | Single section card titled `Danger zone` (red label) with two rows: `Leave space` (if not owner) and `Delete space` | `Delete space` triggers slug-confirm gate |

The Danger tab gets the only filled-red button in the entire settings surface, and only after the slug match.

## 3. Switch spaces / documents (PRD §4.8)

Spaces rail is locked at 52px icons. Page tree lives inside the document column header as a breadcrumb + tree popover, not a third pane.

### Borrow

- **Cursor agents search/empty-state pattern** ([screen f955f80d](https://refero.design/pages/f955f80d-b216-42ee-ad4e-7f32f7140d14)). Compact in-page search with a sticky left rail of `Today` / `Yesterday` recents, and keyboard-hint chips at the bottom of the popover (`↑↓ Navigate`, `↵ Open`, `Esc Close`). This is exactly the visual treatment we want for our switcher popover — sectioned by recency, keyboard chips visible, minimal chrome. Borrow the chip strip verbatim; it teaches the keyboard model without a tooltip.
- **Slite search modal** ([screen af63af6f](https://refero.design/pages/af63af6f-e300-4eed-b960-ec6d0db5fbff)). Centered floating modal: search input at top with a scope dropdown (`In all channels`) on the right, then a single-column result list grouped by type. Borrow the scope dropdown idea: our switcher should let the user *scope to the active space* by default and expand to `All spaces` with one keystroke / one click. Most switches are within-space (jumping between docs); cross-space is the minority case.
- **Kitchen.co folder breadcrumb** ([screen c9f69780](https://refero.design/pages/c9f69780-d305-41b2-a264-ea202f809333)). The document column header carries a breadcrumb `Refero / Bucket 37 / Boring …`, and the sidebar carries the tree. We're folding both into the header: clicking the current page name in the breadcrumb opens the tree popover anchored beneath it. Borrow the visual chevron-separated breadcrumb but **drop the persistent tree pane** — popover only.
- **Skiff document breadcrumb** ([screen d24a9003](https://refero.design/pages/d24a9003-e2b8-442c-b992-67d74a84a797)). Reference for a breadcrumb that includes a trailing **doc actions button** (`⋯`) right next to it, so the doc header carries: `breadcrumb` + `title` + `actions` in one row. Adopt this so the header stays a single row even with the tree-popover trigger included.
- **Factory.ai workspace picker** ([screen 8bcd2e73](https://refero.design/pages/8bcd2e73-62e0-40c9-8b5b-56267986aef4)). A spaces-style picker that lists workspaces with status pills. Confirms the spaces rail's secondary affordance: long-press / right-click on a rail icon could surface a popover with the space name + status + "Open settings", matching the rail-icon-as-primary-control model. Borrow the status pill treatment (small colored dot inline with the name).

### Synthesis: our §4.8 surfaces

Three switching surfaces, each scoped to a clear job:

1. **Spaces rail (52px, always visible).** Click icon → switch space. Hover → tooltip with name. Right-click / long-press → popover with name + "Settings" + "Leave". No labels in the rail itself.
2. **Breadcrumb tree popover (in document column header).** Click the breadcrumb's last segment (current page) → opens a popover with:
   - Search input at top.
   - **Recent** section (5 docs in this space).
   - **Starred** section (if any in this space).
   - **All pages** as a collapsible tree.
   - Footer keyboard-hint chips: `↑↓ Navigate`, `↵ Open`, `⌘↵ Open in new tab`, `Esc Close`.
   - Default scope is current space; one keystroke (e.g. `Tab`) widens to all spaces, surfacing the spaces rail's icons as section headers in the popover.
3. **Command palette (⌘K, modal).** Cross-cutting: jump to any space, any doc, any space-setting tab, run any slash command. Sections in priority order: **Recent docs (any space)** → **Spaces** → **Documents** → **Commands**. Keyboard-driven; closes on Esc. Same chip-strip footer as the popover.

### Avoid

- **Three-pane Notion-style layout** (spaces rail + tree column + editor). The PRD already rejects this — the breadcrumb popover replaces the tree column. Note here so the lock pass doesn't reintroduce it under "but for discoverability we need a tree visible".
- **Rive workspaces dropdown** ([screen 15e676fa](https://refero.design/pages/15e676fa-46bc-4c4f-be4b-dbc490616a84)). Putting workspace switching in a top-bar dropdown labelled "Workspaces". We have a dedicated rail; don't duplicate the affordance into a header dropdown.
- **GitHub-style branch/repo combo selector glued to a page header.** Same duplication problem; the rail owns space switching.
- **Big "Recent files" modal that pretends to be a command palette but only does files** (we've seen this in several entries). Our palette has to do *commands* too, not just navigate; designing the surface as just-a-file-finder would force a separate command UI later. Build it as a palette from day one.
- **Modal switcher with no keyboard hints visible** (e.g. Mailchimp search [ae4eb950](https://refero.design/pages/ae4eb950-c449-4309-8563-8fc7d605176b) reads like a giant search field with no affordance for arrow-key behavior). Always show the chip strip — the v0 user is on a keyboard.
- **Persistent collapsed tree-as-strip on the document column edge** (Notion's "side peek"). The popover dismisses on selection or Esc; do not leave a half-visible tree pinned, which would steal the space the editor needs.

## 4. Pattern locks (recommendations for ADR-0005)

| PRD ref | Pattern locked from refs | Reference |
|---|---|---|
| §4.1 create modal | Single centered modal, three blocks (Name / Privacy / footer). Privacy is two radio rows with one-line subtexts (`Local` / `Shared`). No avatar, no members, no step indicator | Loom e3c99d85, Copy.ai 60b58b03 |
| §4.1 success | Modal closes; new icon appears in rail with brief outline pulse; document column shows empty placeholder. No onboarding tour | (synthesis) |
| §4.2 IA | Horizontal pill/underline tabs under page title, one tab = one screen of sectioned cards. No left rail (single-context) | Factory.ai 7934f954, Kinhive 8307bc81 |
| §4.2 save model | Auto-save on blur; failures inline; no global Save button; per-section Save buttons banned | Linear 79ca4f83, Kinhive 8307bc81 |
| §4.2 danger zone | Red-labelled "Danger zone" section card. `Delete space` triggers an inline slug-confirm form (type the space slug + optional reason); destructive button stays disabled until the slug matches | Linear 79ca4f83, Attio 2f1fe188, Pitch 80261480 |
| §4.8 rail | 52px icon-only rail; right-click / long-press surfaces a contextual popover with name + Settings + Leave | (locked already in original refs); status-dot treatment from Factory.ai 8bcd2e73 |
| §4.8 tree popover | Anchored under the last breadcrumb segment in the document column header. Sections: Search / Recent / Starred / All pages. Footer chip strip teaches keyboard shortcuts. Scope defaults to current space; Tab widens to all spaces | Cursor f955f80d, Slite af63af6f, Kitchen.co c9f69780 |
| §4.8 command palette | ⌘K modal. Sections: Recent docs (any space) → Spaces → Documents → Commands. Same chip-strip footer as the tree popover | Cursor f955f80d |

## 5. Open follow-up

- **Multi-window space context.** When a typing popup or future popup window is open, which space + document does the rail in *that* window represent? Refero gave us no useful reference for sibling-window context indicators. Likely answer: popup windows have no rail, no breadcrumb — they're scoped to a single resource and dismiss on close. Confirm in the lock pass.
- **Owner-vs-non-owner Danger tab.** Owner sees `Delete space`; non-owner sees `Leave space`. Linear and Attio both gate by role, but neither shows a clean reference for *both rows appearing on one tab*. We may want a single `Danger` row that renders contextually (delete or leave) rather than two rows where one is always disabled.
- **Shared-space membership at create time.** PRD §4.1 says no invites at create. Loom puts them in the modal anyway. We're skipping them, but the empty-state placeholder in the new space should surface a single inline `Invite peer` chip pointing at the Members tab — Refero references don't cover this exact moment well, so it's our call.
- **Tree popover under deep hierarchies.** If a space has 500 pages, "All pages" as a tree inside a popover may be too heavy. Slite handles it with channel scope + search; we may want a "virtualized tree only beyond depth N" rule. No Refero answer here.

---

_Next: fold the §4.1 modal shape and §4.2 horizontal-tab + auto-save + slug-confirm into the PRD draft, then promote the pattern-lock rows into ADR-0005 alongside the original refs doc's locks._
