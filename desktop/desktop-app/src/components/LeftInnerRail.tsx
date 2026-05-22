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
import { NavPanel } from "./panels/NavPanel";
import { PagesPanel } from "./panels/PagesPanel";

const PAGES_ID = "pages";
const NAV_ID = "nav";
const DEFAULT_EXPANDED: ReadonlyArray<string> = [PAGES_ID, NAV_ID];

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
				// The rail uses `PanelContainer` directly; the icon is only
				// consumed by the matching `PanelChipBar`, which `LeftInnerRail`
				// doesn't render. We still carry an icon so the descriptor can
				// be reused if a future composition step adds a chip strip.
				icon: <span aria-hidden>P</span>,
				content: <PagesPanel />,
			},
			{
				id: NAV_ID,
				title: t("panels.nav.title", "Nav") as ReactNode,
				icon: <span aria-hidden>N</span>,
				content: <NavPanel />,
			},
		],
		[t],
	);

	return (
		<PanelContainer className={className} expandedIds={effectiveExpanded} onCollapse={handleCollapse} panels={panels} />
	);
}
