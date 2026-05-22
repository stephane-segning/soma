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
 *   - SDK rejection → compact `Empty` ("Could not load pages").
 *   - happy path → `TreePopover` with the space's pages flattened into
 *     `TreeDoc` rows (`{ id, title, parentId }`).
 *
 * Selecting a row navigates to `/spaces/:spaceId/pages/:pageId`.
 *
 * Note: `@soma/desktop-app` doesn't pull in TanStack Query (see its
 * `package.json`), so we run a plain `useEffect` + `useState` fetch
 * with a "stale request" guard against race conditions.
 */

import type { StoredPage } from "@soma/sdk";
import { type TreeDoc, TreePopover } from "@soma/ui/components/nav/tree-popover";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { backend } from "../../lib/backend";

type LoadState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; pages: StoredPage[] } | { kind: "error" };

/** Compact muted line for empty / loading / error states. Single
 *  flex row, no centered placard, no dashed box — keeps the panel
 *  from collapsing into a giant whitespace void when the space has
 *  zero pages (which is the typical first-run state). */
function PagesEmptyLine({ children }: { children: React.ReactNode }) {
	return <div className="px-3 py-2 text-base-content/55 text-xs">{children}</div>;
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
	const { spaceId } = useParams<{ spaceId?: string }>();
	const [state, setState] = useState<LoadState>({ kind: "idle" });

	useEffect(() => {
		if (!spaceId) {
			setState({ kind: "idle" });
			return;
		}
		let cancelled = false;
		setState({ kind: "loading" });
		backend.pages
			.list(spaceId)
			.then((pages) => {
				if (cancelled) return;
				setState({ kind: "ready", pages });
			})
			.catch(() => {
				if (cancelled) return;
				setState({ kind: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [spaceId]);

	if (!spaceId) {
		return <PagesEmptyLine>{t("panels.pages.empty_no_space", "Select a space")}</PagesEmptyLine>;
	}

	if (state.kind === "loading" || state.kind === "idle") {
		return <PagesEmptyLine>{t("panels.pages.loading", "Loading…")}</PagesEmptyLine>;
	}

	if (state.kind === "error") {
		return <PagesEmptyLine>{t("panels.pages.error", "Could not load pages")}</PagesEmptyLine>;
	}

	if (state.pages.length === 0) {
		return <PagesEmptyLine>{t("panels.pages.empty_no_pages", "No pages yet")}</PagesEmptyLine>;
	}

	return (
		<TreePopover
			documents={toTreeDocs(state.pages)}
			onClose={() => {
				// The pages panel is a persistent rail slot, not a transient
				// popover — `onClose` is a no-op. TreePopover invokes it after
				// a row is picked; we intentionally leave the rail mounted.
			}}
			onSelect={(pageId) => navigate(`/spaces/${spaceId}/pages/${pageId}`)}
		/>
	);
}
