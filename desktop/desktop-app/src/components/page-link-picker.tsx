/**
 * PageLinkPicker — transient popover behind the editor's "Page link"
 * add-menu item (`@soma/editor`'s `onInsertPageLink`). Lets the user
 * link an existing page in the current space, or create a new
 * sub-page of the page currently open.
 *
 * Composes two existing pieces rather than inventing a new list/search
 * widget:
 *   - `@soma/ui`'s `TreePopover` — the same "pick a page in this
 *     space" primitive `PagesPanel` uses for its own tree (search +
 *     recents + keyboard nav come for free).
 *   - the shared `createPage()` helper (`lib/create-page.ts`) for the
 *     "New sub-page" affordance, so a page minted from here can't
 *     drift out of sync with every other "New Page" entry point
 *     (SpaceView, PagesPanel, the command palette, ⌘N).
 *
 * `desktop-app` deliberately has no `motion` / `react-feather`
 * dependency (see `components/icons.tsx`'s docstring), so this shell
 * is a plain conditionally-rendered overlay — no enter/exit animation
 * — rather than reaching for `@soma/ui`'s `Modal` or `CommandPalette`.
 * Those also weren't a fit here: `Modal`'s own card chrome would
 * visually double up with `TreePopover`'s already-self-contained
 * glass-panel, and `CommandPalette` is the single global ⌘K surface
 * (fixed section model, its own hotkey binding) — not meant to be
 * mounted a second time for a narrower, space-scoped pick.
 */
import type { StoredPage } from "@soma/sdk";
import { type TreeDoc, TreePopover } from "@soma/ui/components/nav/tree-popover";
import { OverlayPortal } from "@soma/ui/components/overlays/overlay-portal";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { backend } from "../lib/backend";
import { createPage } from "../lib/create-page";
import { PlusIcon } from "./icons";

export type PickedPage = { pageId: string; title: string; href: string };

type PageLinkPickerProps = {
	/** Mounted only while true — no internal open/close animation. */
	open: boolean;
	spaceId: string;
	/** The page currently being edited; a created page nests under it. */
	currentPageId: string;
	onClose: () => void;
	onPick: (page: PickedPage) => void;
};

type LoadState = { kind: "loading" } | { kind: "ready"; pages: StoredPage[] } | { kind: "error" };

function toTreeDocs(pages: StoredPage[]): TreeDoc[] {
	return pages.map((page) => ({
		id: page.pageId,
		title: page.title,
		// Same simplification `PagesPanel` makes: `TreePopover` renders a
		// strict single-parent tree, `StoredPage.parentPageIds` is plural.
		parentId: page.parentPageIds[0] ?? null,
	}));
}

function toPicked(spaceId: string, page: StoredPage): PickedPage {
	return { pageId: page.pageId, title: page.title, href: `/spaces/${spaceId}/pages/${page.pageId}` };
}

export function PageLinkPicker({
	open,
	spaceId,
	currentPageId,
	onClose,
	onPick,
}: PageLinkPickerProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const [state, setState] = useState<LoadState>({ kind: "loading" });
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setState({ kind: "loading" });
		setCreateError(null);
		backend.pages
			.list(spaceId)
			.then((pages) => {
				if (!cancelled) setState({ kind: "ready", pages });
			})
			.catch(() => {
				if (!cancelled) setState({ kind: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [open, spaceId]);

	// Plain `keydown` listener rather than `react-hotkeys-hook` (a
	// `desktop-ui` dependency `desktop-app` doesn't carry) — Escape is
	// the only chord this overlay needs.
	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	const handleCreate = useCallback(async () => {
		setCreating(true);
		setCreateError(null);
		try {
			const page = await createPage(spaceId, t("pages.untitled", "Untitled"), [currentPageId]);
			onPick(toPicked(spaceId, page));
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : String(err));
			setCreating(false);
		}
	}, [spaceId, currentPageId, t, onPick]);

	const handleSelect = useCallback(
		(pageId: string) => {
			const page = state.kind === "ready" ? state.pages.find((p) => p.pageId === pageId) : undefined;
			if (page) onPick(toPicked(spaceId, page));
		},
		[state, spaceId, onPick],
	);

	if (!open) return null;

	return (
		<OverlayPortal>
			{/*
			 * Two overlapping `fixed inset-0` layers instead of one div that
			 * both paints the backdrop and hosts the content: a real
			 * `<button>` for the click-to-dismiss backdrop (inherently
			 * interactive and keyboard-operable, so it doesn't need a
			 * `noStaticElementInteractions/useKeyWithClickEvents` escape
			 * hatch) sits behind a `pointer-events-none` centering wrapper
			 * whose content re-enables `pointer-events-auto`. A click on the
			 * content lands on the content (a sibling, not a descendant of
			 * the backdrop button), so there's no bubbling to stop and no
			 * onClick-bearing static `<div>` either.
			 */}
			<button
				aria-label={t("pages.page_view.page_link.close", "Close")}
				className="fixed inset-0 z-40 bg-base-content/30 backdrop-blur"
				onClick={onClose}
				type="button"
			/>
			<div className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center p-4 pt-24">
				<div className="pointer-events-auto flex w-80 flex-col gap-2">
					<button
						className="glass-panel flex items-center gap-2 px-3 py-2 text-left text-sm shadow-elevated hover:bg-base-200 disabled:opacity-60"
						disabled={creating}
						onClick={() => void handleCreate()}
						type="button"
					>
						<PlusIcon className="size-3.5 text-base-content/60" />
						{creating
							? t("pages.page_view.page_link.creating", "Creating…")
							: t("pages.page_view.page_link.new_subpage", "New sub-page")}
					</button>
					{createError ? <p className="glass-panel px-3 py-2 text-error text-xs">{createError}</p> : null}
					{state.kind === "ready" ? (
						<TreePopover
							currentId={currentPageId}
							documents={toTreeDocs(state.pages)}
							onClose={onClose}
							onSelect={handleSelect}
						/>
					) : (
						<div className="glass-panel px-3 py-2 text-base-content/60 text-sm shadow-elevated">
							{state.kind === "error"
								? t("pages.page_view.page_link.error", "Could not load pages")
								: t("pages.page_view.page_link.loading", "Loading pages…")}
						</div>
					)}
				</div>
			</div>
		</OverlayPortal>
	);
}
