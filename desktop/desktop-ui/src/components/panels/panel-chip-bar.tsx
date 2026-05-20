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
 * **Visual.** Floating pill: `bg-base-100/70 backdrop-blur-sm`,
 * rounded, soft border + shadow. `max-w-[200px]`, chips `flex-wrap`
 * onto a second row if a caller registers more than ~4 panels. No
 * transitions on the bar itself (snap appear/disappear).
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
				// Floating pill — translucent + blur so it reads as overlay
				// above the editor without competing for attention.
				"flex flex-wrap items-center gap-0.5 rounded-lg border border-base-300/60 bg-base-100/70 p-1 shadow-sm backdrop-blur-sm",
				"max-w-[200px]",
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
