/**
 * LeftInnerRail — the second column of the desktop shell, sitting
 * between the 52 px outer Spaces rail and the main content column.
 *
 * Hosts two panels:
 *   1. **Pages** — page hierarchy for the currently-selected space
 *      (`PagesPanel`).
 *   2. **Nav**  — static space-scoped routes (`NavPanel`).
 *
 * Composition only: every visual is a `@soma/ui` primitive. The rail
 * is a thin wrapper around `PanelContainer` with two `PanelDescriptor`s.
 *
 * Default state: both panels expanded. The expanded set can be made
 * controllable via the optional `expandedIds` + `onCollapse` props;
 * when omitted, state lives internally so the rail is drop-in usable
 * from `AppLayout` (the composition step wires it in).
 */
import { PanelContainer, type PanelDescriptor } from "@soma/ui/components/panels/panel-container";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavIcon, PagesIcon } from "./icons";
import { NavPanel } from "./panels/nav-panel";
import { PagesPanel } from "./panels/pages-panel";

const PAGES_ID = "pages";
const NAV_ID = "nav";
const DEFAULT_EXPANDED: ReadonlyArray<string> = [PAGES_ID, NAV_ID];

/** Exported so AppLayout can mount a matching `PanelChipBar` in
 *  `mainTopLeft` to re-expand collapsed panels. */
export const LEFT_RAIL_PANEL_IDS = { pages: PAGES_ID, nav: NAV_ID } as const;
export const LEFT_RAIL_DEFAULT_EXPANDED = DEFAULT_EXPANDED;

export type LeftInnerRailProps = {
	/**
	 * Controlled expanded set. When provided, the rail's open/closed
	 * state is owned by the parent; `onCollapse` must be wired to
	 * remove ids. When omitted, state lives internally and both panels
	 * start expanded.
	 */
	expandedIds?: ReadonlySet<string> | ReadonlyArray<string>;
	/** Fired when a panel's header `−` button is clicked. */
	onCollapse?: (id: string) => void;
	className?: string;
};

export function LeftInnerRail({ expandedIds, onCollapse, className }: LeftInnerRailProps) {
	const { t } = useTranslation();

	const [internal, setInternal] = useState<Set<string>>(() => new Set(DEFAULT_EXPANDED));
	const controlled = expandedIds !== undefined;

	const effectiveExpanded = useMemo<ReadonlySet<string>>(() => {
		if (!controlled) return internal;
		return expandedIds instanceof Set ? expandedIds : new Set(expandedIds);
	}, [controlled, expandedIds, internal]);

	const handleCollapse = useCallback(
		(id: string) => {
			if (controlled) {
				onCollapse?.(id);
				return;
			}
			setInternal((prev) => {
				if (!prev.has(id)) return prev;
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		},
		[controlled, onCollapse],
	);

	const panels = useMemo<PanelDescriptor[]>(
		() => [
			{
				id: PAGES_ID,
				title: t("panels.pages.title", "Pages") as ReactNode,
				// Rendered in the panel header (Panel draws `icon` before the
				// title) and reused by the matching `PanelChipBar` in AppLayout.
				icon: <PagesIcon />,
				content: <PagesPanel />,
			},
			{
				id: NAV_ID,
				title: t("panels.nav.title", "Nav") as ReactNode,
				icon: <NavIcon />,
				content: <NavPanel />,
				// Nav holds 1–3 fixed rows. Shrinking it to content-height
				// lets the sibling Pages panel reclaim the void instead of
				// each card splitting the rail 50/50 regardless of content.
				size: "content",
			},
		],
		[t],
	);

	return (
		<PanelContainer className={className} expandedIds={effectiveExpanded} onCollapse={handleCollapse} panels={panels} />
	);
}
