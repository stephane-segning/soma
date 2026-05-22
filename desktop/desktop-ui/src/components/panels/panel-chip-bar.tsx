/**
 * PanelChipBar — a floating horizontal row of `PanelChip`s.
 *
 * **Placement.** Designed to sit in the main content area's top-left
 * or top-right corner (not inside the rail). When the rail opens
 * beside main, main shrinks and the chip bar rides along with it
 * because it's absolutely positioned relative to main, not the shell.
 * Drop it into `DesktopShell`'s `mainTopLeft` / `mainTopRight` slot.
 *
 * **Visibility contract.** Every registered panel always renders a
 * chip. The chip's `expanded` state mirrors the bar's `expandedIds` —
 * expanded chips paint with a primary-color tint so the bar doubles as
 * a "which panels are open right now" indicator. Clicking a chip
 * toggles the matching panel; the parent decides whether that means
 * add or remove via the `onToggle` callback.
 *
 * **Visual.** No card chrome — just a `backdrop-blur-md` clipped to
 * `rounded-lg`. The bar reads as "the thing behind the editor, only
 * blurred." Max-width is `200px` and chips `flex-wrap` to a second row
 * if a caller registers more than ~4 panels.
 */
import { type ReactNode, useMemo } from "react";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { PanelChip } from "./panel-chip";

export type PanelChipDescriptor = {
	id: string;
	/** Already-sized icon node (size-3.5 is the canonical size). */
	icon: ReactNode;
	/** Plain-text label used for accessibility + tooltip. */
	label?: string;
};

export type PanelChipBarProps = {
	panels: ReadonlyArray<PanelChipDescriptor>;
	/** Set of panel ids that are currently expanded in the rail. */
	expandedIds?: ReadonlySet<string> | readonly string[];
	/**
	 * Fired when the user clicks a chip. The parent decides whether
	 * this means "expand the panel" or "collapse the panel" by reading
	 * its own `expandedIds` state — the chip bar does not assume the
	 * direction so the same handler can flip the panel either way.
	 */
	onToggle?: (id: string) => void;
	/**
	 * Hint to the assistive-tech reader about where the bar lives in
	 * the layout. The actual positioning is up to the host slot.
	 */
	placement?: "top-left" | "top-right";
	className?: string;
};

export function PanelChipBar({
	panels,
	expandedIds,
	onToggle,
	placement = "top-right",
	className,
}: PanelChipBarProps) {
	const t = useT();
	const expandedSet = useMemo(
		() =>
			expandedIds instanceof Set
				? expandedIds
				: new Set<string>(expandedIds ?? []),
		[expandedIds],
	);

	if (panels.length === 0) return null;

	return (
		<div
			aria-label={t({
				id: "panel-chip-bar.aria-label",
				defaultMessage:
					placement === "top-left"
						? "Left panel switcher"
						: "Right panel switcher",
				values: { placement },
			})}
			className={cn(
				// Blur-only overlay — no card chrome (no border, no shadow,
				// no opaque fill). The blur is the entire visible affordance;
				// the chips inside carry whatever weight is needed.
				"flex max-w-[200px] flex-wrap items-center gap-0.5 rounded-lg p-1 backdrop-blur-md",
				className,
			)}
			role="toolbar"
		>
			{panels.map((panel) => (
				<PanelChip
					expanded={expandedSet.has(panel.id)}
					icon={panel.icon}
					key={panel.id}
					label={panel.label}
					onClick={onToggle ? () => onToggle(panel.id) : undefined}
				/>
			))}
		</div>
	);
}
