# Plan 02: Replace Yoopta With TipTap (Notion-Like Editor)

Owner: Soma desktop (Electron) + `soma-daemon` storage/collab surfaces

Goal
- Replace the current Yoopta editor in `desktop/soma` with a TipTap/ProseMirror editor that feels "Notion-like".
- Keep collaboration backed by Yjs, mediated by `soma-daemon` (not a websocket server).
- Enable Notion-style blocks: slash menu, drag/drop blocks, nested pages, backlinks, databases (table/kanban/list/calendar), comments, and AI blocks via `soma-agentd`.

Non-goals
- Backwards-compatible migration of existing Yoopta documents (staging data can be dropped).
- Shipping every Notion feature in the first cut (databases + comments + full collab is not a weekend scope).

Constraints / repo rules
- Desktop apps should not read blob files directly; use `soma-blob://daemon/{space_id}/{cid}` and daemon IPC (`UploadBlob`, `ReadBlob`).
- Keep business logic out of renderer components; call daemon IPC via services / RTK Query wrappers.
- Avoid adding new global state systems in Soma (no Zustand; use RTK Query + slices).

Reference implementation to copy patterns from
- Colanode editor folder: `packages/ui/src/editor/*`
  - Slash menu: `extensions/commander.tsx` (TipTap Suggestion on `/`)
  - Block handle + drag: `menus/action-menu.tsx` (NodeSelection + `view.dragging`)
  - Atom blocks that reference external entities (database/page/file): `extensions/*` + `views/*`

---

## Architecture decision: "Editor as its own package"

Create a new workspace package under `desktop/`:
- Path: `desktop/desktp-editor/`
- Name: `@soma/editor`
- Purpose: TipTap editor component(s) + shared extensions/menus/NodeViews that `desktop/soma` can consume.

This mirrors existing shared packages (`desktop/desktp-ui`, `desktop/desktp-proto`, `desktop/desktp-config`) and keeps editor complexity out of the app.

---

## Data model decisions (what lives where)

### Documents
Current daemon document RPC stores `content_json` as a string:
- `proto/daemon/v1/daemon.proto`: `UpsertDocumentRequest.content_json`, `GetDocumentResponse.content_json`

New editor serialization:
- Store ProseMirror JSON (TipTap `editor.getJSON()`) as the `content_json`.
- Do not store large binary content in JSON. Blobs remain CID-referenced.

### Blobs (images/files)
- Remain daemon-owned; renderer uploads via daemon IPC, inserts a block containing `{ cid, mime, size, name }`.
- Renderer renders bytes via `soma-blob://daemon/{space_id}/{cid}`.

### Collaboration (target state)
- Yjs document state lives in `soma-daemon`.
- Renderer uses TipTap Collaboration extension wired to a custom provider that speaks daemon IPC, not websocket.
- Awareness (cursors/presence) is also mediated by daemon.

### Databases (Notion-style)
Follow Colanode's key idea:
- Editor stores a small atom block with `{ database_id, inline? }`.
- Database schema/rows/views live outside the editor doc (daemon-owned tables or Yjs maps).
- NodeView renders the database UI and talks to daemon APIs.

### Comments
Comments should not be embedded as "content".
- Store comment threads in daemon storage.
- Anchor comments to the editor using stable IDs + relative positions (best done once Yjs is in place).

### Backlinks
Phase 1: renderer-only backlinks by scanning page docs.
Phase 2: daemon indexes `page_link` references for fast queries and cross-device consistency.

---

## Phased delivery plan

### Phase A (Weekend Cutover): Notion-like writing feel, JSON persistence (no Yjs yet)
Objective: replace Yoopta editor with TipTap and ship:
- Slash menu
- Drag/drop blocks
- Nested pages (create + link)
- GitHub @mention auto-linking (no user directory)
- Blobs (image/file) via daemon
- AI blocks (local streaming) via `soma-agentd`
- Basic backlinks (renderer-only)

Where:
- New editor package: `desktop/desktp-editor`
- Replace usage in `desktop/soma/src/renderer/src/routes/screens/space-page.tsx`
- Keep autosave behavior similar to current (debounced write via `documentsService.queueDaemonSync`)

### Phase B (Collaboration): Yjs via `soma-daemon`
Objective: real-time multi-user editing with TipTap Collaboration.
Changes:
- Add daemon RPC(s) for Yjs doc open/apply/update streaming.
- Persist Yjs updates/snapshots in daemon storage (SQLite) under `backend/bins/daemon`.
- Renderer switches from "debounced JSON saves" to "Yjs updates".

### Phase C (Databases): table + kanban + list + calendar
Objective: Notion-like databases embedded inline or full-page.
Changes:
- New daemon storage schema + RPCs for database entities (db, fields, views, rows, cells).
- Editor adds `database` atom node + NodeView to render DB UI.
- DnD interactions for kanban + list; calendar needs date fields and view config.

### Phase D (Comments + robust backlinks)
Objective: inline comment threads anchored to text/blocks, and backlinks that survive edits.
Changes:
- Comment storage + APIs in daemon.
- Anchor model based on Yjs relative positions (or block_id + offset).
- Backlink indexing in daemon for "linked references" queries.

---

## Key technical risks (explicit)

- "Weekend rewrite" scope risk:
  - Databases (all views) + comments + collab is too large to do correctly in 2 days.
  - Recommended: weekend = Phase A cutover; do Phase B/C/D iteratively.
- TipTap/Yjs integration complexity:
  - Correct cursor/awareness handling and conflict-free persistence must be done in daemon, not in renderer.
- Editor block DnD:
  - Needs to use ProseMirror-native dragging (`view.dragging`) to behave like Notion; naive HTML5 DnD is buggy.

---

## Definition of done (Phase A)

- `desktop/soma` no longer renders Yoopta on a page; it renders TipTap.
- Documents still persist via existing `UpsertDocument`/`GetDocument` JSON string fields.
- Slash menu inserts blocks; block handle appears and supports drag-reorder of block nodes.
- Images/files upload via daemon and render through `soma-blob://` protocol.
- "New sub-page" works via daemon `EnsurePage` + `SetPageParents` and inserts a `page_link` block.
- Basic GitHub mention auto-link works.
- AI block inserts and can stream output from `soma-agentd`.

