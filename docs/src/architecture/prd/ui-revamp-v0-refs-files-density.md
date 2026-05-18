# UI Revamp v0 — Inspiration References: Files, Empty States, Density

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md) and the original [ui-revamp-v0-refs.md](./ui-revamp-v0-refs.md). Scope here is narrower: **§4.9 file upload/attach**, the **§6 `Empty` primitive**, **density tokens**, and the **shared dense list-row** pattern that members / bots / attachments / recent-docs all collapse onto.

Method: Refero `search_screens` + `get_screen_image` thumbnail inspection across ~40 candidate screens. Anything already covered by the original refs doc (3-pane layout, right-area panels, mention picker, bot-add flow, ACP switcher, scoped-card capability form) is **not** revisited here.

---

## 1. Files — upload, attach, preview (PRD §4.9)

The PRD locks two surfaces: **drop-into-document** (inline attachment block) and **drop-into-attachments-panel** (right-area panel slot). Plus the .txt-as-ZIP bug forces an explicit "MIME detected from content, not extension" UX path for misdetected files.

### Borrow

- **Cohere Coral chat with file panel** ([screen 441bb012](https://refero.design/pages/441bb012-16ea-46b3-bdfa-a7dcfbae2278)). The right-side **FILES** tab inside the chat tool panel is the closest analog to our attachments-panel-as-right-area-slot. Layout: a small "Drag and drop or browse files" dashed-border tile at the top (~80px tall, not the whole panel), then a single **in-progress row** (`Another one.pdf · 261.2 KB · 6%`) with a thin inline progress bar baked into the row background, then a `MOST RECENT` section of completed rows with checkbox + filename + size. Notable: the dropzone does *not* take the whole panel — it sits above the file list so completed files stay visible during a new upload. Borrow this directly for the attachments panel.
- **Cohere composer attachment chips.** Below the chat composer, in-message attachments render as **dense rounded chips**: filename truncated, MIME label below (`PDF`), size on the same row, dismiss `×` on the right. Two chips fit side-by-side. This is exactly what the in-document attachment block should look like when a file is attached to a message — not a card with a thumbnail preview taking 200px of vertical space.
- **Manus "Project files" list** ([screen 98a3a8be](https://refero.design/pages/98a3a8be-f51f-4646-8c8b-ed18e59b6dfe)). Vertical list of file rows: a small colored file-type glyph (12px square, color-coded by family — JSON blue, JPG sepia, PDF red, XLS green), then filename (truncates mid-string with ellipsis on long names like `trun_038bd2c43735443c8…json`), then a faint `Mar 3, 2026` second-line date, then a `⋯` overflow on the right. Row height ~52px. This is the right pattern for the in-document attachment block when it lists multiple files, and for the attachments-panel list once it's populated.
- **Mercury "Attach file to 3 transactions" drop modal** ([screen 6546282e](https://refero.design/pages/6546282e-f554-476b-8e85-b7c09b3cc2d3)). Useful for the **drag-overlay state**: when a user drags a file onto the editor, the entire document column gains a 2px **dashed blue border** with a single centered tile reading `Drag and drop here or click to upload` + a thin subline `You may upload one PDF, JPEG, or PNG file`. The dashed border is at the *viewport-section* level, not on individual paragraphs. This solves the "where does the file go if I drop it?" ambiguity without needing per-block drop targets.
- **MIME mismatch presentation.** No surveyed product had a clean "we detected this as type X, not Y" UX — most just reject the file or accept it silently. Synthesis: render the attachment chip with a tiny **warning glyph in front of the type label**, e.g. `txt (detected) · 14 KB`, with a hover-tooltip `Type detected from content. The filename suggested a different extension.` No toast, no modal. The chip itself is the affordance.

### Avoid

- **Big full-modal upload dialogs** (Spatial Chat 568da656, MonoDesk 232f8a5a, TikTok 5b25d071). They all use a centered modal with a 300px+ dropzone, three tabs (`Gallery / Upload / Link`), and a big primary CTA. Our editor flow is drag-into-document — there is no separate "upload" verb the user invokes; the modal is the wrong surface entirely.
- **Per-block drop targets** (Notion-style "insert here" indicators between every paragraph). At 14px base font with dense spacing, gaps between paragraphs are 6–8px; inserting a 32px drop indicator between every block during drag-over is visually catastrophic. One viewport-level overlay, not N inline ones.
- **Large image-preview cards inline.** Cohere's *inline* version (the chips beneath the composer) is what we want. The card variant some tools use (200px preview thumbnail + 3 lines of metadata) eats document vertical space and undermines "memory in, intelligence out."
- **Floating per-file delete buttons** that only appear on hover at the row's far right with no visible affordance. With keyboard users + dense rows the dismiss control must be persistent or in an overflow menu, not hover-conditional.

### Synthesis for §4.9

| Surface | Pattern |
|---|---|
| **Drag-over (whole document)** | 2px dashed accent border on the document column + single centered "Drop to attach" tile. Mercury 6546282e style, but full-column not modal. |
| **Drag-over (attachments panel)** | Panel body gets the same dashed border treatment; existing list stays visible behind it. |
| **In-document attachment block** | Cohere chip-row: glyph + filename + MIME + size + ×, two-per-row when width allows. |
| **Attachments panel resting list** | Manus row: 12px colored type glyph + truncated name + faint date + `⋯`. Row 48–52px. |
| **Multi-file upload progress** | Cohere inline progress: thin bar baked into the row background (no separate progress strip), `n%` on the right; completed rows replace the progress bar with size. |
| **MIME mismatch (e.g. .txt → ZIP fix)** | Warning glyph + parenthetical detected type in the chip; tooltip explains. No toast. |

---

## 2. Empty states — the `Empty` primitive (PRD §6)

The PRD spec is tight: **icon + text + single CTA**, one component. The challenge is that we have **five distinct empty surfaces** sharing one primitive: empty space (no docs yet), empty document (cursor on `/` hint), empty chat, empty attachments panel, empty bots list. Each needs the same shape but *different content tone* — the workspace empty needs "do this first," the chat empty just needs to not feel broken.

### Borrow

- **Handshake "No documents uploaded"** ([screen 52807c78](https://refero.design/pages/52807c78-44c3-486b-a4fd-fddfb1be9d9c)). Textbook minimal empty state: small line-illustration (~120px wide), bold one-line headline (`No documents uploaded`), faint single-line subtext (`You have not uploaded any documents, yet.`), single outlined button (`Upload a document`). Centered vertically. No hero, no marketing language. This is the right floor for our `Empty` component — the line-illustration size is the constraint that keeps the primitive from being abused with hero art.
- **Linear "No matching members"** ([screen f7d2b961](https://refero.design/pages/f7d2b961-5f3e-4699-a227-23a3e26a0452)). Same pattern but even smaller: a thin geometric icon (~80px), a single line `No matching members`, and a *secondary-action* button (`Clear filter ×`). Important nuance: when the empty is **filter-induced** (chat panel filtered, attachments filtered) the CTA changes from "create" to "clear filter." We need both modes in the `Empty` API.
- **Literal.club "No chats here yet"** ([screen c3162810](https://refero.design/pages/c3162810-ed85-473f-a019-0cb33506d67d)). For empty chat panel: a **dashed-border rectangle** the width of the column with just the text `No chats here yet` inside it — no icon, no CTA. This is what to do when the panel is so narrow (320px) that even a 120px icon dominates. Two empty-state variants emerge: *full* (icon + text + CTA) for main canvases, *compact* (dashed box + one line) for narrow panels.
- **Parallel "Archived inbox"** ([screen ac499274](https://refero.design/pages/ac499274-4a99-4417-9686-327d2171f63c)). A centered illustration + `Your archive is empty` headline + faint explanatory subtext. Notably, **no CTA at all** — archive is a destination, not a place you act from. Confirms: the `Empty` component needs the CTA slot to be *optional*. Required slots: icon, headline. Optional: subtext, primary CTA, secondary CTA.

### Avoid

- **Hero illustrations** (Slab 7b352005 has a giant whiteboard scene). At 14px density with editor-priority real estate, an illustration that fills 40% of the panel is wasted pixels. Cap line-illustrations at ~120px wide; cap geometric icons at ~64px.
- **Marketing copy in empty states** ("Welcome! Get started by uploading your first document and discover how Soma transforms…"). One-line tone only. The CTA does the heavy lifting.
- **Multi-CTA empty states** ("Upload a document · Import from Notion · Watch a tutorial"). The PRD says single CTA — keep it.
- **Animated empty states** (Sketch and Tango both lean on Lottie). Adds runtime cost; battery hit on Electron + Rust + napi is non-zero and our priority is editor responsiveness.

### `Empty` API (proposed)

```
Empty
  icon?: ReactNode        // 64–120px, optional
  headline: string        // one line
  subtext?: string        // one line, faint
  primary?: { label, onClick }
  secondary?: { label, onClick }   // typically "Clear filter"
  variant: 'full' | 'compact'      // compact = dashed-box single-liner
```

### Per-surface content (locked tone)

| Surface | Variant | Headline | Subtext | CTA |
|---|---|---|---|---|
| Space, no docs | full | `Nothing here yet` | `Create a document to start.` | `New document` |
| Empty document | (editor hint, not `Empty`) | grey cursor placeholder `Type / for commands` | — | — |
| Chat panel | compact | `No messages yet` | — | — |
| Attachments panel | compact | `No files attached` | — | (drop hint shows on drag-over) |
| Bots list | full | `No bots in this space` | `Add a bot by pasting its peer address.` | `Add bot` |
| Filtered list (any) | full | `No matches` | — | secondary: `Clear filter` |

---

## 3. Density tokens — the concrete table

This is the section the original refs doc explicitly punted on. Goal here: pick numbers, not vibes. Survey signal across **Linear, Cursor, Mercury, Resend, Stellate, Polar, Sana, Rox**:

- All eight ship at **13–14px** in dense table/list contexts, even though their marketing pages use 15–16px.
- Row heights cluster at **40–52px** for member/transaction tables.
- Column padding (horizontal) clusters at **12–16px**, vertical at **8–12px**.
- Border-vs-shadow: Resend, Linear, Stellate run on **1px borders + bg-step contrast only, no shadows on inline surfaces**. Modals get shadows; everything else doesn't.
- Mercury and Resend use **24–32px hover bg-step** as the primary affordance (no border change on hover, no shadow).

### Surveyed specifics

- **Linear members** ([f7d2b961](https://refero.design/pages/f7d2b961-5f3e-4699-a227-23a3e26a0452), [736fc893](https://refero.design/pages/736fc893-38d5-40c2-b176-703640f2b959)). Sidebar items at ~13px, content body at ~14px. Row height ~36px in the members table — the densest of the surveyed set. No row dividers; only a single header bottom-border. Hover state = +1 background step, no border change.
- **Cursor dashboard** ([49819c4b](https://refero.design/pages/49819c4b-6362-48c8-8eb8-bf9fe56ea2ac)). Warm cream theme, **15px** base — slightly looser than what we want. But its border-only-no-shadow card style is exactly the right move. Card padding ~20px which we'd tighten.
- **Resend Audience properties table** ([8cbd8746](https://refero.design/pages/8cbd8746-e691-414c-ab5c-843d3ea3d81c)). Dark theme, **13px** monospace for table cells, 14px for nav. Row height ~40px. Tag pills (`string` / `number`) at 11px caps, ~18px tall. This is the densest of the dark refs and the closest typographic match to what we want.
- **Mercury Users** ([2bc9e411](https://refero.design/pages/2bc9e411-fe34-4ebb-a1d4-44bad78ef00b)). 14px name, 12px secondary email line, row ~52px because of the avatar + 2-line text. Status pill is bg-only (no border), color-coded `Active`. Hover = +1 bg step, no border.

### Proposed token table

| Token | Value | Rationale |
|---|---|---|
| `--font-size-base` | **14px** | PRD lock; matches Linear/Mercury body. |
| `--font-size-ui-sm` | **13px** | Sidebar items, table cells, chip text — Linear/Resend baseline. |
| `--font-size-ui-xs` | **11px** | Uppercase section labels (`MOST RECENT`), pill caps. |
| `--line-height-body` | **1.5** (21px @14) | PRD says 1.45; bump to 1.5 because list metadata lines visibly compress at 1.45. Body reading at 1.5 is industry standard. Override to 1.45 only in document prose if we need tighter editor density. |
| `--line-height-ui` | **1.2** (17px @14) | PRD value; matches surveyed UIs. |
| `--space-0.5` | 2px | New Tailwind step. |
| `--space-1` | 4px | |
| `--space-1.5` | 6px | New Tailwind step. |
| `--space-2` | 8px | Default vertical padding for rows. |
| `--space-3` | 12px | Default horizontal padding for rows + most component padding. |
| `--space-4` | 16px | Section-level padding (e.g. panel body), card padding. |
| `--space-6` | 24px | Section gaps. Largest default; anything bigger is one-off. |
| `--row-height-sm` | **32px** | Compact chip rows (mention picker, dropdown items). |
| `--row-height-md` | **40px** | Default list-row height — bots, members, attachments. |
| `--row-height-lg` | **52px** | Avatar + two-line text rows (e.g. members with email subline). |
| `--radius-sm` | 4px | Chips, pills, mention atoms. |
| `--radius-md` | 6px | Surfaces, cards, inputs. PRD lock; nothing bigger. |
| `--radius-lg` | 8px | Modals only (the *one* place we still allow shadow). |
| `--border-1` | 1px solid `base-300` | The primary separator. |
| `--shadow-modal` | `0 8px 24px rgba(0,0,0,.12)` | The *only* shadow token. Used on modals + the typing popup window only. |
| `--shadow-inline` | none | Explicitly nothing. Don't add one later "just for hover." |
| `--bg-hover-delta` | +1 step (`base-100` → `base-200`) | All hovers go through bg, not border, not shadow. |
| `--bg-active-delta` | +2 steps (`base-100` → `base-300`) | Pressed/selected. |
| `--focus-ring` | `0 0 0 2px var(--accent)` inset | Keyboard focus only, never on hover/active. |

### Border-vs-shadow ratio (the lock)

Inventory of every elevated surface in v0:

| Surface | Border | Shadow |
|---|---|---|
| Panel (right area) | 1px left/divider | none |
| Card (inside a panel or settings) | 1px | none |
| Input | 1px, +accent on focus | none |
| Dropdown / popover | 1px | none |
| Mention picker | 1px | none |
| Slash menu | 1px | none |
| Tooltip | 1px | none |
| **Modal** | 1px | **shadow-modal** |
| **Popup window (typing/exam)** | OS chrome | **OS-default** |

That is the entire shadow inventory. If a new surface is proposed, default to "no shadow."

---

## 4. List density — the shared row pattern

Members, bots, attachments, recent docs all collapse to one row shape: **leading visual + primary + secondary + meta + actions**. Locking one pattern means one component (`DenseRow`) and one keyboard interaction model.

### Borrow

- **Mercury Users row** ([2bc9e411](https://refero.design/pages/2bc9e411-fe34-4ebb-a1d4-44bad78ef00b)) is the gold reference. Left to right: 28px avatar — name (14px) over email (12px faint) — role pill (bg-only) — job title (faint) — department (faint) — status pill (bg-only, color-coded) — overflow on hover. Status pills coexist with metadata cleanly because they're **bg-only with no border**, so they read as text-with-color, not as buttons.
- **Manus Project files** ([98a3a8be](https://refero.design/pages/98a3a8be-f51f-4646-8c8b-ed18e59b6dfe)) shows the smaller variant: 16px file-type glyph instead of avatar, single-line filename, faint date subline, `⋯` always visible (not hover-only) because users land on this list expecting to act.
- **Resend Audience** ([8cbd8746](https://refero.design/pages/8cbd8746-e691-414c-ab5c-843d3ea3d81c)) for the case where the list is filterable: header row has tabs (`Contacts / Properties / Segments / Topics`), a search field full-width on the next row, a column header strip with sort affordance, then the rows. We adopt this when the list is the whole panel/page; we skip the column header when the list is a sub-section of a larger settings tab.

### Avoid

- **Hover-only actions** (Linear's members table hides the `⋯` until row hover). Bad for keyboard, bad for touch on Electron. Always-visible overflow.
- **Three-line rows** with bio + role + tags + activity. Cap at 2 visible lines per row. Anything else moves to the detail surface.
- **Stripe-style alternating-row stripes**. They fight the bg-hover-delta model — hover becomes invisible on the dark stripe rows. Single bg, no stripes.
- **Inline-edit on every cell**. Click-to-edit only on the primary field; everything else goes through the row's overflow → "Edit" action.

### `DenseRow` slot model

```
[ leading      ] [ primary          ] [ status ] [ meta ] [ actions    ]
  avatar/icon    name + secondary    pill         faint    overflow / inline
  28px           14 / 12 stack
                 truncates
```

- **Leading**: 16–28px depending on entity (16px for files, 20px for bots, 28px for members).
- **Primary**: one line truncated, optional 12px faint subline.
- **Status**: bg-only pill (`Active` / `Pending` / `Error` / `Active` etc.). Hidden when none.
- **Meta**: `date · count · size`, single faint line, no wrap.
- **Actions**: always-visible `⋯` overflow. If exactly one action is universal (e.g. `Open` for recent docs, `Resend invite` for invited members) it can be an inline icon button before the overflow.

### Row heights

| Use | Height | Token |
|---|---|---|
| Mention picker items | 32px | `--row-height-sm` |
| Bots / attachments / recent docs | 40px | `--row-height-md` |
| Members (avatar + email subline) | 52px | `--row-height-lg` |

---

## 5. Pattern locks (recommendations for ADR-0005)

| PRD ref | Pattern locked from refs | Reference |
|---|---|---|
| §4.9 drag-overlay | 2px dashed accent border on the entire document column (not per-block), single centered "Drop to attach" tile | Mercury 6546282e |
| §4.9 attachments panel layout | Dashed dropzone tile *above* the file list, never as the whole panel | Cohere 441bb012 |
| §4.9 in-document attachment | Chip-row: type glyph + filename + MIME + size + `×`, two per row when width allows | Cohere 441bb012 composer chips |
| §4.9 attachments list row | 16px color-coded file-type glyph + truncated name + faint date subline + always-visible `⋯` | Manus 98a3a8be |
| §4.9 upload progress | Inline progress bar baked into the row background; `n%` on the right; replaced by size on completion | Cohere 441bb012 |
| §4.9 MIME mismatch | Warning glyph + parenthetical detected type in the chip (`txt (detected) · 14 KB`), tooltip on hover; no toast | (synthesis — no good surveyed ref) |
| §6 `Empty` (full variant) | 64–120px line-icon, one-line headline, optional one-line subtext, optional single CTA | Handshake 52807c78 |
| §6 `Empty` (compact variant) | Dashed-border rectangle the width of the column, single faint line, no icon, no CTA | Literal.club c3162810 |
| §6 `Empty` (filter variant) | Same shape, but CTA becomes `Clear filter ×` (secondary slot) | Linear f7d2b961 |
| Density base font | 14px body, 13px UI-sm, 11px UI-xs | Linear / Mercury / Resend convergence |
| Density line-height | 1.5 body, 1.2 UI chrome (PRD said 1.45 body — bump to 1.5) | surveyed-UI convergence |
| Density rows | 32 / 40 / 52px tiers | Mercury 2bc9e411, Manus 98a3a8be |
| Border-vs-shadow | 1px border + bg-step on every elevated surface; shadow only on modal + popup window | Resend, Linear, Stellate convergence |
| List rows | Leading + primary(+sub) + status pill + meta + always-visible `⋯` | Mercury 2bc9e411 |
| List row actions | Always-visible overflow; never hover-only | (anti-pattern observed in Linear) |

---

## 6. Open follow-up

- **MIME mismatch UX has no strong Refero precedent.** The chip + warning + tooltip synthesis above is our invention. Worth a mini-usability check during the §4.9 lock pass — specifically whether users notice the warning glyph at 11–12px or whether we need a colored chip background instead.
- **Document-level drop-target vs. block-level drop-target.** PRD §4.9 implies "drag into document" but doesn't say whether you can drop *between two specific paragraphs*. We're recommending viewport-level only for v0 (one dashed border for the whole column). A block-level variant is a v0.1 question — TipTap supports it, but the visual cost at 14px is high.
- **Density toggle behavior.** PRD §6 lists `DensityProvider` as new; v0 defaults to dense and cozy is post-v0. But the token table above needs a cozy variant defined *now* so we don't paint ourselves into a 14px-only corner. Suggested cozy values: body 15px, row heights +4px each, padding +1 step. Defer to v0.1 lock.
- **Recent docs list.** Not surfaced in any current PRD flow but it's an obvious "history" panel candidate. When the history panel ships, it should consume `DenseRow` directly — confirm the slot model works for `doc title · last edited time · author avatar · ⋯`.
- **Empty document hint vs. `Empty` primitive.** The empty-document state is *not* a use of `Empty` — it's an editor placeholder. Worth a note in the component plan so the two don't get conflated when scaffolded.

---

_Next pass after this lands: revise PRD §4.9 with the synthesized table from §1; add the cozy-variant token note to §3 of the PRD; promote the locked rows in §5 above into ADR-0005 alongside the original refs doc's locks._
