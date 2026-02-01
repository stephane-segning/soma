# Weekend Task List: TipTap Cutover (Phase A)

Scope: "Notion-like writing feel" + keep existing daemon document persistence (JSON string).
Out of scope this weekend: daemon-backed Yjs collaboration, full database system, durable comment anchoring.

Target outcome by Sunday night
- TipTap editor renders on `/spaces/:spaceId/pages/:pageId` (current `space-page.tsx`).
- Slash menu + block drag handle works.
- Page link blocks + nested pages work.
- Images/files upload via daemon and render via `soma-blob://`.
- AI block exists and streams output via `soma-agentd`.

---

## Friday night (setup + scaffolding)

1) Create new workspace package
- Add `desktop/desktp-editor/` as `@soma/editor`
- Update `pnpm-workspace.yaml` to include it
- Add minimal `tsup.config.ts`, `tsconfig.json`, `src/index.ts`

2) Dependencies (expected)
- TipTap core/react + the minimum extensions (paragraph/text/document, marks, lists, codeblock, dropcursor, placeholder, suggestion)
- `@floating-ui/react` as peer dependency (already used in Soma)

---

## Saturday (editor MVP)

3) Implement `@soma/editor` MVP component
- `DocumentEditor` (or similar) props:
  - `initialContentJson?: string | null`
  - `placeholder?: string`
  - `onChange(json: object | null): void`
  - `onSaveRequested?(): void` (optional)
  - `spaceId`, `pageId` (for blob URLs and page commands)

4) Core extensions
- Doc schema: doc/paragraph/text
- Marks: bold/italic/underline/strike/code + link
- Blocks: headings 1/2/3, blockquote, divider, codeblock, bullet/ordered/task lists
- UX: placeholder, dropcursor, trailing paragraph

5) Slash menu ("/")
- Minimal commands:
  - Heading 1/2/3
  - Bullet/number/todo list
  - Divider
  - Code block
  - Table (optional this weekend)
  - Image/file (stub to insert a placeholder node for now)
  - AI block
  - Page link / new sub-page

6) Block handle + drag/drop reorder
- Port Colanode approach:
  - detect hovered block (via `posAtDOM` scan)
  - show floating controls on left
  - on drag start: set `NodeSelection`, set `view.dragging = { slice, move: true }`

7) Wire into Soma page route
- Replace `YooptaEditorWithTools` usage in:
  - `desktop/soma/src/renderer/src/routes/screens/space-page.tsx`
- Keep the same autosave cadence (debounce ~750ms) but serialize TipTap JSON.

---

## Sunday (integrations + polish)

8) Blobs (image/file)
- Add `image` and `file` atom nodes:
  - attrs: `{ cid, mime, size, name }`
- Implement paste/drop upload flow:
  - call daemon `UploadBlob` (existing IPC/service)
  - insert node referencing CID
- Render:
  - `img src="soma-blob://daemon/{spaceId}/{cid}"`
  - file block renders name + size + open/download action (optional)

9) Nested pages
- Add `page_link` atom node:
  - attrs: `{ pageId }`
  - NodeView renders title (fetched via existing `documents_list_pages` cache or direct call)
- Slash command "New sub-page":
  - `documentsService.ensurePage({ spaceId, parentPageIds: [currentPageId] })`
  - `documentsService.setPageParents(...)` if needed
  - insert `page_link` block

10) Backlinks (MVP)
- Render backlinks section in the page UI (outside editor):
  - `documentsService.listPages(spaceId)`
  - load each page doc JSON (best-effort) and scan for `page_link` nodes
  - show list of pages linking to current page

11) GitHub mentions
- Simple: auto-link `@username` to `https://github.com/username` (regex + mark)
- No suggestion UI.

12) AI blocks
- Add `ai_block` atom node:
  - attrs: `{ id, prompt, status }`
  - NodeView shows prompt + output area
- Command:
  - create block
  - call agentd stream and append tokens to output (store in node attrs or nested content)

13) Remove Yoopta surface area (optional cleanup)
- Stop importing `@yoopta/*` in renderer routes/components that are now unused.
- Keep dependencies for now; remove later after build is stable.

---

## Checkpoints (to avoid "half-finished")

- Saturday checkpoint:
  - TipTap editor loads and saves JSON; slash menu inserts at least headings + lists + divider; block dragging moves blocks.
- Sunday checkpoint:
  - Images upload + render; page links work; AI block streams; backlinks panel shows at least something.

