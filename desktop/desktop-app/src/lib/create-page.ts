/**
 * createPage — the one place that knows how to mint a new page.
 *
 * Shared by every "New Page" entry point (SpaceView's inline
 * affordance, PagesPanel's inline affordance, the command palette, the
 * native-menu ⌘N, the raw ⌘N keyboard shortcut, and the editor's
 * "Page link" add-menu item — see `PageLinkPicker` — when the user
 * chooses "New sub-page" instead of linking an existing one) so they
 * can't drift out of sync with each other or with what the editor
 * requires.
 *
 * `parentPageIds` defaults to `[]` (a top-level page); pass the
 * currently-open page's id to create a sub-page nested under it.
 *
 * Two backend calls, in order:
 *   1. `backend.pages.ensure` — creates the page-navigation row
 *      (title + parents) so it shows up in `PagesPanel`'s tree.
 *   2. `backend.documents.upsertDraft` — seeds the page's document
 *      content. `@soma/editor`'s schema is `Document.extend({ content:
 *      "heading block*" })` (see `desktop-editor/src/components/
 *      document-editor/extensions.ts`): the doc MUST start with a
 *      heading or the editor fails to load it. A lone empty heading
 *      satisfies that (`block*` allows zero trailing blocks) and, as a
 *      bonus, is exactly where `DocumentEditor`'s existing
 *      `autofocus: "end"` lands the caret on mount — so a freshly
 *      created page opens with the cursor already in the title, ready
 *      to type, with no editor changes needed.
 *
 * After both calls succeed, any mounted `PagesPanel` picks the new page
 * up via the real `pages-changed` domain event — `desktop-api`'s
 * `ensure_page` handler (`documents.rs`) now publishes it after the
 * daemon write, and it reaches the renderer over the same broadcast
 * channel both the Tauri host (`app.emit`) and `desktop-bff` (`ws.rs`)
 * forward. Earlier revisions of this function dispatched a local
 * `soma:page-created` `window` `CustomEvent` as a stand-in for that —
 * now that the real event is wired end to end, `PagesPanel` listens for
 * it directly instead (see its own doc comment), so this module no
 * longer needs to know who's listening.
 */
import { createId } from "@paralleldrive/cuid2";
import type { StoredPage } from "@soma/sdk";
import { backend } from "./backend";

const SEED_PAGE_CONTENT_JSON = JSON.stringify({
	type: "doc",
	content: [{ type: "heading", attrs: { level: 1 } }],
});

export async function createPage(spaceId: string, title: string, parentPageIds: string[] = []): Promise<StoredPage> {
	const pageId = createId();
	const page = await backend.pages.ensure({ spaceId, pageId, title, parentPageIds });
	await backend.documents.upsertDraft({
		spaceId,
		documentId: pageId,
		contentJson: SEED_PAGE_CONTENT_JSON,
		updatedAtMs: Date.now(),
	});
	return page;
}
