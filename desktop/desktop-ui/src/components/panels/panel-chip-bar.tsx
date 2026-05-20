/**
 * PanelChipBar — a floating horizontal row of `PanelChip`s.
 *
 * **Placement.** Designed to sit in the main content area's top-left
 * or top-right corner (not inside the rail). When the rail opens
 * beside main, main shrinks and the chip bar rides along with it
 * because it's absolutely positioned relative to main, not the shell.
 * Drop it into `DesktopShell`'s `mainTopLeft` / `mainTopRight` slot.
 *
 * **Visibility contract.** A chip only renders for panels whose id is
 * **not** in `expandedIds`. When a panel expands into the rail, its
 * chip is removed from the bar. Collapsing the panel (via the `−`
 * button in the Panel header) puts the chip back. The bar itself
 * returns `null` when every panel is expanded — it's not a permanent
 * UI element.
 *
 * **Visual.** No card chrome — just a `backdrop-blur-md` clipped to
 * `rounded-lg`. The bar reads as "the thing behind the editor, only
 * blurred." No fill, no border, no shadow; the chips themselves
 * supply all the visible weight (and they only become visible on
 * hover because their resting state is just an icon glyph). On a
 * fully-white surface the bar is invisible until the cursor lands on
 * a chip — which is the right answer, since chips are an *overflow*
 * affordance, not a permanent toolbar. Max-width is `200px` and
 * chips `flex-wrap` to a second row if a caller registers more than
 * ~4 panels.
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
	/** Fired when the user clicks a collapsed chip to expand it. */
	onExpand?: (id: string) => void;
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
	onExpand,
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

	const collapsed = panels.filter((panel) => !expandedSet.has(panel.id));
	if (collapsed.length === 0) return null;

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
			{collapsed.map((panel) => (
				<PanelChip
					icon={panel.icon}
					key={panel.id}
					label={panel.label}
					onClick={onExpand ? () => onExpand(panel.id) : undefined}
				/>
			))}
		</div>
	);
}
