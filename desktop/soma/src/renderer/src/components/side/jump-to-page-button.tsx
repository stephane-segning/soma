/**
 * Jump-to-page trigger — opens the @soma/ui `TreePopover` anchored
 * under the AsideNavigation header.
 *
 * Sits alongside the persistent DnD `PageTree` (which stays for
 * primary reorder/expand interaction). This popover is the
 * fast-search affordance: fuzzy match titles, jump straight to a
 * page, ⌘↵ opens it in a new tab.
 */
import { usePagesQuery } from "@app/queries/pages";
import { tabsActions } from "@app/store/tabs";
import { useAppDispatch } from "@app/store/hooks";
import {
	autoUpdate,
	flip,
	FloatingPortal,
	offset,
	shift,
	useClick,
	useDismiss,
	useFloating,
	useInteractions,
} from "@floating-ui/react";
import { TreePopover, type TreeDoc } from "@soma/ui/components/nav/tree-popover";
import { Search } from "react-feather";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

export function JumpToPageButton() {
	const { t } = useTranslation("common");
	const { spaceId, pageId } = useParams<{
		spaceId: string;
		pageId: string;
	}>();
	const pagesQuery = usePagesQuery(spaceId ?? "");
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const [open, setOpen] = useState(false);

	const { refs, floatingStyles, context } = useFloating({
		middleware: [offset(6), flip(), shift({ padding: 6 })],
		onOpenChange: setOpen,
		open,
		placement: "bottom-start",
		whileElementsMounted: autoUpdate,
	});
	const click = useClick(context);
	const dismiss = useDismiss(context);
	const { getFloatingProps, getReferenceProps } = useInteractions([click, dismiss]);

	const untitled = t("space.pages.untitled", "Untitled");
	const documents = useMemo<TreeDoc[]>(() => {
		const pages = pagesQuery.data ?? [];
		return pages.map((page) => ({
			id: page.pageId,
			title: page.title || untitled,
			// Pages can have multiple parents in this p2p model; pick the
			// first as the primary parent for the popover's tree view.
			parentId: page.parentPageIds[0] ?? null,
		}));
	}, [pagesQuery.data, untitled]);

	if (!spaceId) return null;

	return (
		<>
			<button
				aria-label={t("space.pages.jump", "Jump to page")}
				className="btn btn-circle btn-ghost btn-xs"
				ref={refs.setReference}
				type="button"
				{...getReferenceProps()}
			>
				<Search className="size-4" />
			</button>
			{open ? (
				<FloatingPortal>
					<div
						ref={refs.setFloating}
						style={floatingStyles}
						{...getFloatingProps()}
					>
						<TreePopover
							currentId={pageId ?? null}
							documents={documents}
							onClose={() => setOpen(false)}
							onSelect={(id) => navigate(`/spaces/${spaceId}/pages/${id}`)}
							onSelectInNewTab={(id) =>
								dispatch(
									tabsActions.openTab({
										path: `/spaces/${spaceId}/pages/${id}`,
										title:
											documents.find((doc) => doc.id === id)?.title ?? untitled,
									}),
								)
							}
						/>
					</div>
				</FloatingPortal>
			) : null}
		</>
	);
}
