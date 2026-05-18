# UI Revamp v0 — Editor Surface References

Companion to [ui-revamp-v0.md](./ui-revamp-v0.md) and second pass after [ui-revamp-v0-refs.md](./ui-revamp-v0-refs.md). The first refs doc covered shell-level surfaces (3-pane, right-area panels, mention picker, bot-add flow, backend switcher). This one covers what happens **inside the document** — the surfaces the PRD §5 kill list flags ("the current floating editor menu") and the §6 component plan lists as new (`SlashMenu`, `SelectionBubble`).

Same rules as the first refs doc: this is a kit of references for the lock pass, not a design. The PRD constraints carry over — 14px base, dense, no global shadows, 1px borders, `rounded-md` ceiling.

## 1. Slash menu (PRD §6 `SlashMenu`)

Inserts a block at the caret when the user types `/`. Needs to cover headings, lists, code, task, callout, divider, table, image, embed, plus our extensions (AI prompt, bot mention, link-to-doc).

### Borrow

- **Craft — block context popover** ([screen c59f0e28](https://refero.design/pages/c59f0e28-9eda-4861-a477-5992a2af2b92)). Not strictly a slash menu, but the **payload shape** is exactly what we want: a single column of rows, each row = a small monochrome icon + an action label, with one **mid-emphasis row** ("Turn into Card") highlighted via a fill tint, dividers between semantic groups, and shortcut hints reserved for the right edge. No descriptions, no thumbnails — the row is the affordance. This is the density we need.
- **Craft — shortcuts cheatsheet** ([screen f6f77988](https://refero.design/pages/f6f77988-1ac7-4644-bc66-242b40fcdf1a)). Useful as a **taxonomy reference** for slash items, not as visual lock: four columns (Style / Navigate / Organize / Task) with keyboard-shortcut chips. Tells us how Craft groups block-related actions; our slash menu's section order should mirror that mental model (Text → List → Embed → Action → Advanced), because users coming from Notion/Craft already know it.
- **Resend — left vertical block rail** ([screen 811edb3c](https://refero.design/pages/811edb3c-d172-4add-bfce-ce8f5edb25e6)). A 4-icon vertical strip (`T`, image, 2x2 grid, sparkle) floats just outside the content column. This is a **complement** to the slash menu, not a replacement — the rail is the "I don't remember the slash command" affordance and lives in the gutter. Same items as the slash menu, surfaced differently. Worth adopting as a peripheral option for mouse users; keyboard users hit `/`.
- **Search-as-you-type filtering.** Across every editor we surveyed (Craft, Slab, Notion-likes), the slash menu uses a substring match on the row's label *and* alias list (e.g. `/h1` matches "Heading 1"). Important: filter narrows the **same** flat list and re-groups; do not collapse sections to "best match" — the user types `/co` and needs to see both `Code` and `Callout` so they can disambiguate with one more keystroke.

### Avoid

- **Notion-style descriptions under each item.** Common in marketing screenshots — a two-line row with "Heading 1 / Big section heading". At 14px base this doubles the menu height for no information gain to repeat users. Use a single line with the label and a right-aligned shortcut hint instead.
- **Thumbnails / previews for every block type.** Tome and Glorify lean on tile previews ([Glorify 785ab890](https://refero.design/pages/785ab890-8447-4414-8873-d85ab7b907a8)). They make sense for design-canvas tools where blocks are visual. For prose blocks (heading, list, code, callout) a thumbnail is wasted pixels. Reserve previews for the embed sub-menu only (image, video, link card).
- **A modal/centered command palette.** Some apps (Luma 12ebb274, Deezer 7a916f34) center a search modal on dimmed canvas. Wrong for a slash menu — it has to anchor at the caret so the user's eye doesn't move. Popover, not modal.
- **Sticky "AI" tile at the top.** It's tempting (and Anthropic-friendly) but biases every slash interaction toward the LLM. Our LLM lives in the right-area chat panel (§4.5); the slash menu's job is block insertion. AI actions belong in the selection bubble's "More" menu and as a regular slash row (`/ask`).

## 2. Selection bubble (PRD §6 `SelectionBubble`)

Floats above selected text. Replaces the "ugly current floating menu" called out in §5.

### Borrow

- **Slab — single-row bubble** ([screen 912347ff](https://refero.design/pages/912347ff-08c8-44be-984a-a980e45fb641)). The closest reference to what we want. Top-anchored above the selection, single dark pill, contents in left-to-right order: `Normal text ▾` (block-style dropdown) · `B` · `i` · `U` · `S` · `</>` (code) · `link` · `highlight ▾` · `comment` · `⋯`. The block-style dropdown is the trick that lets a single row handle both **inline** (B/i/U) and **block** (Heading / Quote / Bullet) actions without spawning a second row. Lock this structure. Approx 8 icons + 1 dropdown + 1 overflow = the maximum that stays readable at 14px.
- **Medium — minimal dual-purpose bubble** ([screen 22dce083](https://refero.design/pages/22dce083-1764-4dee-aea5-815b6f0106b8)). Worth noting for the **arrow-down tail** on the bubble (a small triangle pointing at the selection). Adds 4px of height for clear anchoring; we should keep this since at our density a borderless floating pill can read as detached. Medium's content is too sparse (`B i | T T | " 1≡ | 💬`) — they omit underline/strike entirely, which we cannot.
- **Resend — bottom selection bar** ([screen 811edb3c](https://refero.design/pages/811edb3c-d172-4add-bfce-ce8f5edb25e6)). Has the densest treatment of typography controls we found: `Text ▾  </>  B  I  U  S  </>  AB  ≣ ≣ ≣  ≣`. Bottom-anchored rather than top-anchored, but the **chip-style grouping** (block-style chip on the left, divider, inline marks in the middle, divider, alignment on the right) is the right pattern for visually parsing many controls at a glance. Adopt the dividers.
- **Wandb — small inline popover near tool icon** ([screen 14943dab](https://refero.design/pages/14943dab-2d00-4deb-9e8f-5d0446f2c5e4)). Shows the **link-insert pattern** done well: clicking the link icon swaps the bubble's content area for a single text input with auto-paste + Enter to confirm, no second modal. That swap-in-place is what we want — not a second popover layered on top.

### Avoid

- **Two-row bubbles by default.** Notion classic exposes block-style as a separate top row. At our base size this becomes a 60px-tall floating shape, occluding the line above. Use Slab's single-row pattern with a dropdown for block-style.
- **A floating "More" button that opens a wide menu.** It moves the eye twice (bubble → menu) and the menu often overlaps the bubble. Instead: `⋯` opens a small column **anchored to the bubble's right edge**, containing color, clear-formatting, AI-rewrite, comment-thread — the long tail of low-frequency actions. Keep the bubble itself stable; only the overflow moves.
- **Inline link previews inside the bubble.** Some editors show the link target's OG image as soon as you paste — at our density it shoves the bubble to 2 rows. Show the parsed URL as plain monospace text in the bubble's link-input mode; previews belong on the inserted link block, not the editing chrome.

## 3. Block menus + drag handles (PRD §3 dense default)

The "row hover" affordance: on `mouseenter` of a block, show `⋮⋮` drag handle and `+` insert button in the **left gutter** outside the content column. Click the handle (or right-click anywhere on the block) → per-block menu.

### Borrow

- **Craft — per-block context menu** ([screen c59f0e28](https://refero.design/pages/c59f0e28-9eda-4861-a477-5992a2af2b92)). The reference. Action list, top to bottom: `Add Content / Add Reaction / Add Comment / Turn into Card / Open Assistant / Remind Me ▸ / Insert Block Above / Insert Block Below / Copy Link to Block / Delete`. Notable: **Turn into Card** is the only action with a colored fill — the destructive `Delete` is plain text at the bottom, which is correct (destructive is not the same as emphasis). The submenu marker `▸` on "Remind Me" gives us the pattern for nested actions (we'll use it for `Turn into ▸` → list of block types, and `Color ▸` → swatches).
- **Craft — right-side Insert/Format/Style/Info panel** ([same screen](https://refero.design/pages/c59f0e28-9eda-4861-a477-5992a2af2b92)). A more permanent palette pinned to the right of the editor. **Reject** as a default surface (it competes with our right-area panel stack) but note the affordance: when a block is selected, the right-area can host a contextual **Block** panel (replacing the page-tree popover) for users who prefer a persistent inspector over hover affordances. Future v0.1.
- **Gutter `⋮⋮ +`, not in-content.** Across Notion-likes the drag handle never overlays the text — it lives in the left gutter, becomes visible on row hover, and the cursor stays on the text. We honor this: gutter width budget is ~24px, two stacked 16px icons, no labels.
- **Right-click parity.** The same per-block menu opens on right-click anywhere in the row. This is critical for trackpad users who never hover-discover the handle. Lock both entry points.

### Avoid

- **Persistent visible drag handles.** Mailchimp ([08af2456](https://refero.design/pages/08af2456-a1f9-4d7c-804b-3ae6e137dd2e)) and many email builders show a permanent drag chrome around every block. Looks busy and prevents the editor from feeling like prose. Hover-only.
- **Hamburger menus per block.** Some editors use a `⋯` instead of `⋮⋮`, which conflates "drag me" with "open menu". Use `⋮⋮` strictly for drag (cursor: grab) and `+` strictly for insert-below; right-click is the menu entry.
- **A "Turn into" picker that opens a modal.** It interrupts flow. Use a flyout submenu off the per-block menu — same shape as the slash menu's block-type rows, so users learn one list.

## 4. Code blocks and embeds (PRD §6 — `SlashMenu` outputs)

### Borrow

- **Anthropic Workbench — "Code for Claude API" modal** ([screen 983dbb9e](https://refero.design/pages/983dbb9e-1a8e-4373-94f7-4465c9249aca)). The cleanest in-doc code-block chrome we found. Top strip: `Python ▾` on the left (the language picker), `Copy Code` + `View Docs` on the right. Code body has line numbers in a muted left column, syntax-highlighted body, no shadow, just a 1px border + slight bg shift. **Lock this header layout** for inline code blocks: `<language-pill>` left, `<copy>` right, nothing else on first render. The "Run" action — when we add it for executable blocks — joins the right cluster as a third button, not a separate row.
- **Linear developer docs** ([screen cbbd2bc8](https://refero.design/pages/cbbd2bc8-9bc9-4cdd-ba74-00484914bddf)). Useful for the **language pill** styling: small monospace label inside a low-contrast pill, no chevron when there's only one language. Our pill always shows the chevron because every code block can be re-languaged.
- **Resend image-block chrome** ([screen eff09bc8](https://refero.design/pages/eff09bc8-6e14-42bf-9591-ca7630ec1234)). Image embed renders edge-to-edge inside the content column with a thin border, a centered hover handle (drag/resize), and a small caption row below the image (italic, muted). No floating action bar over the image itself. We adopt: **embed chrome is the caption row + a hover-revealed `⋯` in the top-right corner of the embed**, not a persistent toolbar.
- **Mercury attachment card** ([screen 018f4d0f](https://refero.design/pages/018f4d0f-47e5-4c3e-8833-4b78650960d7)). For file embeds: thin horizontal card with a left mime-type icon, filename + size middle, download icon on the right. One row, ~36px tall. This is what a non-previewable file (zip, dmg, binary) should render as inline. Distinct from image/video which gets full-bleed.

### Synthesis: embed chrome rules

| Embed type | Chrome | Notes |
|---|---|---|
| Code block | Header strip: `<lang ▾>` left, `<copy>` right. Border + bg, no shadow. | Run button added later for executable kinds. |
| Image / Video | Full-bleed inside content column. Caption row below. Hover-`⋯` top-right for menu (alt text, replace, download, delete). | No persistent toolbar on the asset itself. |
| File (non-previewable) | Single-row card: icon · filename · size · download. | Mime-detected from content (PRD §4.9). |
| Link card (URL embed) | Card: site favicon, title, 1-line description, URL slug. Border, no shadow. | If unfurl fails, fall back to plain underlined link, not an error card. |
| Failed embed | Inline 1-row warning row, retry action on the right. **Not** a centered modal, not a toast. | Editing the URL stays in place. |

### Avoid

- **Lightbox / modal preview for inline images.** Multiple references do this ([Clipchamp 3370d540](https://refero.design/pages/3370d540-828e-414f-915d-70a180e9f7b5), [Rox bf8cf417](https://refero.design/pages/bf8cf417-4bd6-4cb7-b558-106c915d7de5)) — fine for a gallery, wrong inside a document. Click on an inline image edits its properties; nothing should fullscreen.
- **A floating language picker inside the code body.** Some references float it over the code top-right (overlapping code on long lines). Anchor it to the header strip.
- **Copy buttons that show a green check toast.** A 600ms inline label swap ("Copy" → "Copied") inside the same button is denser and faster.
- **Run-output panels stacked under every code block by default.** Run is opt-in per block; the output area appears only after a run, collapses by default after the user reads it.

## 5. Pattern locks (recommendations for ADR-0005)

| PRD ref | Pattern locked from refs | Reference |
|---|---|---|
| §6 `SlashMenu` | Single-column popover anchored at caret. Rows = monochrome icon + label + right-aligned shortcut hint. Sections in fixed order (Text · List · Embed · Action · Advanced). Substring filter across labels + aliases. No descriptions, no thumbnails. | Craft c59f0e28 (row shape), Craft f6f77988 (taxonomy), Resend 811edb3c (peripheral rail) |
| §6 `SelectionBubble` | Single-row dark pill above selection. Order: `<block-style ▾>` · B · i · U · S · `</>` · link · highlight · comment · `⋯`. Dividers between block / inline / action clusters. Link icon swaps the row into a single-input link mode in place. | Slab 912347ff (lock), Medium 22dce083 (tail), Resend 811edb3c (dividers), Wandb 14943dab (link mode) |
| §3 row hover | Left-gutter `⋮⋮` drag handle + `+` insert-below, both 16px, gutter ~24px wide, hover-only. Right-click anywhere in the row opens the per-block menu. Drag and menu have distinct icons. | Craft c59f0e28 |
| Per-block menu | Single column. Order: Add Content · Comment · Turn into ▸ · Color ▸ · Copy Link to Block · Insert Above · Insert Below · Duplicate · Delete. Submenus open as flyouts (`▸`), not modals. | Craft c59f0e28 |
| Code block chrome | Top strip: `<language ▾>` left, `<copy>` right (Run later joins right cluster). Line numbers in muted left column. 1px border, no shadow. Inline "Copied" label swap, no toast. | Anthropic Workbench 983dbb9e, Linear cbbd2bc8 |
| Image / video embed | Full-bleed inside content column, caption row below, hover-revealed `⋯` top-right for properties. No persistent toolbar over the asset. | Resend eff09bc8 |
| File embed (non-previewable) | Single-row card: mime-icon · filename · size · download. ~36px tall. | Mercury 018f4d0f |
| Link card embed | Card: favicon · title · 1-line description · URL. Border, no shadow. Fall back to plain link if unfurl fails. | (cross-product convention) |
| Failed embed | Inline 1-row warning, retry on the right, edit URL in place. No modal, no toast. | (no good single ref; constraint follows from §3 density rules) |

## 6. Open follow-up

- **Tables.** Refero coverage of in-doc tables (not data-grid tools) was thin. We need to lock: column-resize affordance, per-cell context menu, header-row toggle, sortable vs static, and how tables collapse when the content column is narrow. Punt to a small follow-up pass; ship v0 with read-only-ish tables (insert / type / delete row, no column resize) and revisit.
- **Math / equation block.** Slab and Craft both support it as a slash item but neither shows the editor UI clearly in the refs we found. KaTeX-shaped input is the de-facto baseline; the only design decision is whether the rendered block sits inline (like code) or full-bleed (like an image). Tentatively: inline-block treatment, same chrome as code, language pill replaced by `LaTeX` static label.
- **AI inline transform** ("rewrite this paragraph"). The PRD keeps AI in the right-area chat, but the selection-bubble overflow has an AI action. We didn't lock how the streaming result lands back in the editor — diff-overlay in place? Insert-below-with-accept-reject? Defer to a dedicated AI-edit refs pass; do not ship in the first cut of `SelectionBubble`.
- **Drag-to-reorder visuals.** All refs hide the drop indicator until the drag is in flight; nobody shows a polished "dropping here" treatment we can copy. Plan: a 2px accent rule between blocks during drag, no spacer animation. Confirm in Storybook against the actual block heights before locking.
- **Mobile / touch.** Out of scope for v0 (no touch target in the product yet), but hover-only handles are a known accessibility risk on touch when we get there. Note for the next revamp.

---

_Next pass after this lands: revise PRD §6 to reference the locked patterns by name; add a Storybook scaffold task per component (`SlashMenu`, `SelectionBubble`, plus the unbranded `BlockMenu` + `RowHoverHandles` that fall out of §3); then promote the §5 table above into ADR-0005 alongside the first refs doc's locks._
