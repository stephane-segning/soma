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
 * After both calls succeed, dispatches `PAGE_CREATED_EVENT` on
 * `window` so any mounted `PagesPanel` can append the new page
 * immediately instead of waiting for its next full reload. This is a
 * stand-in for the backend's `PagesChanged` domain event: the
 * `desktop-api::events::pages_changed(...)` constructor exists but
 * nothing calls it yet (`ensure_page` doesn't publish it), so
 * `backend.events.onDomain` never actually fires for a page create
 * today. Wiring that up is a backend change outside this module's
 * scope; this local event is what keeps the rail in sync in the
 * meantime and can be deleted once the real domain event is wired.
 */
import { createId } from "@paralleldrive/cuid2";
import type { StoredPage } from "@soma/sdk";
import { backend } from "./backend";

const SEED_PAGE_CONTENT_JSON = JSON.stringify({
	type: "doc",
	content: [{ type: "heading", attrs: { level: 1 } }],
});

export const PAGE_CREATED_EVENT = "soma:page-created";

export type PageCreatedDetail = {
	spaceId: string;
	page: StoredPage;
};

export async function createPage(spaceId: string, title: string, parentPageIds: string[] = []): Promise<StoredPage> {
	const pageId = createId();
	const page = await backend.pages.ensure({ spaceId, pageId, title, parentPageIds });
	await backend.documents.upsertDraft({
		spaceId,
		documentId: pageId,
		contentJson: SEED_PAGE_CONTENT_JSON,
		updatedAtMs: Date.now(),
	});
	if (typeof window !== "undefined") {
		const detail: PageCreatedDetail = { spaceId, page };
		window.dispatchEvent(new CustomEvent<PageCreatedDetail>(PAGE_CREATED_EVENT, { detail }));
	}
	return page;
}
