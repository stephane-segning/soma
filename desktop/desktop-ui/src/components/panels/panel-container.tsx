/**
 * PanelContainer — the rail-side host that renders the **expanded**
 * panels of a side rail (left or right).
 *
 * Locked by [PRD §3](../../../../../docs/src/architecture/prd/ui-revamp-v0.md)
 * and [refs main §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md).
 *
 * **What it does, and what it doesn't.** PanelContainer is now a thin
 * composition over `PanelStack`. It receives the full panel inventory
 * and the set of currently-expanded ids, filters the inventory to the
 * expanded subset, and stacks those panels at 100 % of the rail width.
 *
 * It does NOT host the chip strip / icon rail anymore. The bar of
 * collapsed-panel icons lives in the **main column** (top-right or
 * top-left, via `DesktopShell`'s `mainTopLeft` / `mainTopRight`
 * slots), as a `PanelChipBar`. Co-locating expanded + collapsed UI in
 * one component was the original sin behind the "right rail floating"
 * + "rail can't auto-shrink" pair of bugs.
 *
 * **Width.** 100 % of the host rail. No `w-72` cap, no multi-column,
 * no horizontal scroll. The card cap is whatever the user dragged the
 * rail to.
 *
 * **Mount/unmount.** The convention is for the caller to render
 * `<PanelContainer />` only when at least one panel is expanded — and
 * to leave `ShellPanel`'s `content` prop `null` otherwise so the rail
 * unmounts entirely (returning width to 0). If you pass an empty
 * `expandedIds`, this component renders `null`, which lets the rail's
 * `<aside>` collapse without an explicit guard.
 *
 * **Build-time left/right placement.** The caller maintains two panel
 * inventories — one for the left rail, one for the right — and renders
 * two `<PanelContainer>` + two `<PanelChipBar>` pairs. Moving a panel
 * from left to right is a one-line array shift at build time.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { PanelStack } from "./panel-stack";

export type PanelDescriptor = {
	id: string;
	title: ReactNode;
	/** Icon used by the matching `PanelChipBar`. Required even though
	 *  PanelContainer doesn't render it directly — having every
	 *  descriptor carry its icon lets the caller pass the same array to
	 *  both PanelContainer and PanelChipBar without massaging the shape. */
	icon: ReactNode;
	/** Header actions (rendered to the right of the title). */
	actions?: ReactNode;
	/** The panel body. Rendered inside a scroll container. */
	content: ReactNode;
	footer?: ReactNode;
};

export type PanelContainerProps = {
	/** The full panel inventory for this rail (expanded + collapsed). */
	panels: ReadonlyArray<PanelDescriptor>;
	/**
	 * Set of panel ids currently expanded (visible as cards). Panels
	 * not in this set are considered collapsed and skipped here — they
	 * live in the matching `PanelChipBar` instead.
	 */
	expandedIds?: ReadonlySet<string> | readonly string[];
	/** Fired when the user clicks the `−` button on a panel header. */
	onCollapse?: (id: string) => void;
	/** Fired when the user clicks the `×` button on a panel header. */
	onClose?: (id: string) => void;
	className?: string;
};

export function PanelContainer({
	panels,
	expandedIds,
	onCollapse,
	onClose,
	className,
}: PanelContainerProps) {
	const expandedSet = useMemo(
		() =>
			expandedIds instanceof Set
				? expandedIds
				: new Set<string>(expandedIds ?? []),
		[expandedIds],
	);

	const visible = panels.filter((panel) => expandedSet.has(panel.id));
	if (visible.length === 0) return null;

	return (
		<PanelStack
			className={cn("w-full", className)}
			onClose={onClose}
			onCollapse={onCollapse}
			panels={visible}
		/>
	);
}
