/**
 * PagesPanel — page hierarchy for the current space, hosted inside the
 * left inner rail's "Pages" panel slot.
 *
 * Wraps `@soma/ui`'s `TreePopover` with the SDK's page list for the
 * active space. The component is purely a container; rendering of the
 * tree itself (search, recents, starred, react-complex-tree) lives in
 * the UI primitive.
 *
 * State machine:
 *   - no `spaceId` in URL → compact `Empty` ("Select a space").
 *   - first load in flight → compact `Empty` ("Loading…").
 *   - SDK rejection → compact `Empty` ("Could not load pages") + a
 *     "New Page" affordance (list load and page creation are
 *     independent — no reason to block creating just because the list
 *     fetch failed).
 *   - happy path, zero pages → compact `Empty` ("No pages yet") + the
 *     same "New Page" affordance, inline in the same row.
 *   - happy path, pages exist → `TreePopover`, with the "New Page"
 *     affordance in a slim header row above it.
 *
 * Selecting a row navigates to `/spaces/:spaceId/pages/:pageId`.
 * Creating a page uses the shared `createPage()` helper (same one the
 * command palette / native menu / ⌘N shortcut call) and, on success,
 * navigates straight to the new page.
 *
 * Refresh: a full re-`list()` runs on mount/space-change *and* whenever
 * this space's `pages-changed` domain event fires — `desktop-api`'s
 * `ensure_page` / `update_page_title` / `set_page_parents` handlers
 * (`documents.rs`) all publish it after a successful daemon write, and
 * it reaches this renderer over the same broadcast channel both the
 * Tauri host (`app.emit`) and `desktop-bff` (`ws.rs`) forward — see
 * `backend.events.onDomain`'s doc comment in `@soma/sdk`. A full re-list
 * (rather than patching local state for just the create case, as an
 * earlier revision of this component did via a local
 * `soma:page-created` `window` event) keeps this panel correct for
 * *every* kind of change, including a title derived from the editor's
 * first heading while the page is open elsewhere (`page-view.tsx`).
 *
 * `TreePopover` is remounted (via `key={treeVersion}`) on every
 * successful re-list, not just updated via its `documents` prop —
 * verified by hand that without this, a title edit on a page that's
 * already rendered in the tree never reaches the row: `TreePopover`
 * rebuilds a fresh `StaticTreeDataProvider` when `documents` changes,
 * but `react-complex-tree`'s `UncontrolledTreeEnvironment` only re-reads
 * *structure* (added/removed ids) from a swapped provider, not the
 * `data` payload of ids it already rendered, so an in-place title change
 * silently never repaints until the next full remount. A brand-new page
 * (a genuinely new id) *does* show up live, which is what made this easy
 * to miss. `TreePopover` lives in `desktop-ui` (out of scope here), so
 * this works around it from the caller side instead of patching the
 * primitive — the cost is `TreePopover`'s own transient UI state (search
 * text, tree expansion) resetting on every refresh, which is already
 * closer to its actual behavior today: `initialViewState` is a
 * mount-once seed (see that component's doc comment), so expansion
 * resets on *every* mount regardless.
 *
 * Note: `@soma/desktop-app` doesn't pull in TanStack Query (see its
 * `package.json`), so we run a plain `useEffect` + `useState` fetch
 * with a "stale request" guard against race conditions.
 */

import type { StoredPage } from "@soma/sdk";
import { type TreeDoc, TreePopover } from "@soma/ui/components/nav/tree-popover";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { parseActiveSpaceId } from "../../lib/active-space";
import { backend } from "../../lib/backend";
import { createPage } from "../../lib/create-page";
import { PlusIcon } from "../icons";

type LoadState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; pages: StoredPage[] } | { kind: "error" };

/** Compact muted line for empty / loading / error states. Single
 *  flex row, no centered placard, no dashed box — keeps the panel
 *  from collapsing into a giant whitespace void when the space has
 *  zero pages (which is the typical first-run state). `action` is an
 *  optional trailing affordance (the "New Page" button) for the states
 *  where creating a page still makes sense. */
function PagesEmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-2 px-3 py-2 text-base-content/55 text-xs">
			<span className="truncate">{children}</span>
			{action}
		</div>
	);
}

function CreatePageButton({ creating, onClick }: { creating: boolean; onClick: () => void }) {
	const { t } = useTranslation();
	return (
		<button
			className="btn btn-ghost btn-xs shrink-0 gap-1"
			disabled={creating}
			onClick={onClick}
			title={t("palette.commands.new_page")}
			type="button"
		>
			<PlusIcon className="size-3" />
			{creating ? t("panels.pages.creating", "Creating…") : t("palette.commands.new_page")}
		</button>
	);
}

function toTreeDocs(pages: StoredPage[]): TreeDoc[] {
	return pages.map((page) => ({
		id: page.pageId,
		title: page.title,
		// `StoredPage.parentPageIds` is plural (a page can have several
		// parents in Soma's page graph), but `TreePopover` renders a
		// strict single-parent tree. Take the first parent and treat the
		// rest as ignored for rendering purposes; selecting a row still
		// navigates to the same destination regardless of which arm of
		// the graph it was rendered under.
		parentId: page.parentPageIds[0] ?? null,
	}));
}

export function PagesPanel() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	// NOT `useParams()`. This component renders inside a column
	// `AppLayout` passes to `DesktopShell` (a *sibling* of `<Outlet />`),
	// so route params from `spaces/:spaceId` never reach it and
	// `useParams()` resolves to `{}`. Derive the active space from the
	// live pathname instead — same fix as `chat-panel`, `nav-panel` and
	// `bots-panel`.
	const { pathname } = useLocation();
	const spaceId = parseActiveSpaceId(pathname) ?? undefined;
	const [state, setState] = useState<LoadState>({ kind: "idle" });
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	// Bumped on every successful `load()` resolution — forces `TreePopover`
	// to remount (see the module doc comment for why a prop update alone
	// doesn't repaint an existing row's title).
	const [treeVersion, setTreeVersion] = useState(0);

	useEffect(() => {
		if (!spaceId) {
			setState({ kind: "idle" });
			return;
		}
		// Narrowed to `string` once, up front — `spaceId`'s declared type is
		// `string | undefined`, and TS can't carry the guard above into the
		// nested `load`/`onDomain` closures below (either could run later,
		// after a re-render this effect wouldn't see).
		const activeSpaceId = spaceId;
		let cancelled = false;
		// A `pages-changed` event fires at least twice in quick succession
		// for a brand-new page whose heading is typed right away (once for
		// `ensure_page`, again for the first `update_page_title`), so two
		// `load()` calls can have requests in flight at once. Without this,
		// responses resolving out of order could let an older, stale
		// `pages.list()` result overwrite a newer one — same "stale
		// request" hazard `SpacesRailContainer`'s `latestRequestRef` guards
		// against, just scoped to this effect's closure instead of a ref
		// since `load` doesn't need to outlive it.
		let latestRequestId = 0;

		function load() {
			const requestId = ++latestRequestId;
			backend.pages
				.list(activeSpaceId)
				.then((pages) => {
					if (cancelled || requestId !== latestRequestId) return;
					setState({ kind: "ready", pages });
					setTreeVersion((v) => v + 1);
				})
				.catch(() => {
					if (cancelled || requestId !== latestRequestId) return;
					setState({ kind: "error" });
				});
		}

		setState({ kind: "loading" });
		load();

		// A page can be created from here, from `SpaceView`'s own
		// affordance, the global ⌘N / menu / palette command, or retitled
		// by `page-view.tsx` typing into the heading — all of them funnel
		// through handlers that publish `pages-changed` for this space, so
		// one subscription covers every affordance without each one having
		// to know this panel exists.
		const unsubscribe = backend.events.onDomain((event) => {
			if (event.kind === "pages-changed" && event.spaceId === activeSpaceId) load();
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [spaceId]);

	const handleCreate = useCallback(async () => {
		if (!spaceId) return;
		setCreating(true);
		setCreateError(null);
		try {
			const page = await createPage(spaceId, t("pages.untitled", "Untitled"));
			navigate(`/spaces/${spaceId}/pages/${page.pageId}`);
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : String(err));
		} finally {
			setCreating(false);
		}
	}, [spaceId, navigate, t]);

	if (!spaceId) {
		return <PagesEmptyLine>{t("panels.pages.empty_no_space", "Select a space")}</PagesEmptyLine>;
	}

	if (state.kind === "loading" || state.kind === "idle") {
		return <PagesEmptyLine>{t("panels.pages.loading", "Loading…")}</PagesEmptyLine>;
	}

	const createButton = <CreatePageButton creating={creating} onClick={() => void handleCreate()} />;

	if (state.kind === "error") {
		return (
			<div className="flex flex-col">
				<PagesEmptyLine action={createButton}>{t("panels.pages.error", "Could not load pages")}</PagesEmptyLine>
				{createError ? <p className="px-3 pb-2 text-error text-xs">{createError}</p> : null}
			</div>
		);
	}

	if (state.pages.length === 0) {
		return (
			<div className="flex flex-col">
				<PagesEmptyLine action={createButton}>{t("panels.pages.empty_no_pages", "No pages yet")}</PagesEmptyLine>
				{createError ? <p className="px-3 pb-2 text-error text-xs">{createError}</p> : null}
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-end px-1.5 pt-1">{createButton}</div>
			{createError ? <p className="px-3 pb-1 text-error text-xs">{createError}</p> : null}
			<div className="min-h-0 flex-1">
				<TreePopover
					documents={toTreeDocs(state.pages)}
					key={treeVersion}
					onClose={() => {
						// The pages panel is a persistent rail slot, not a transient
						// popover — `onClose` is a no-op. TreePopover invokes it after
						// a row is picked; we intentionally leave the rail mounted.
					}}
					onSelect={(pageId) => navigate(`/spaces/${spaceId}/pages/${pageId}`)}
				/>
			</div>
		</div>
	);
}
