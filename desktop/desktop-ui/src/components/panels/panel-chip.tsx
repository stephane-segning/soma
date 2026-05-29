/**
 * PanelChip — one icon button in the floating `PanelChipBar`.
 *
 * The chip is **persistent** for every registered panel — clicking it
 * toggles the matching panel open or closed. When the panel is open
 * (its id is in the bar's `expandedIds`), the chip renders with a
 * `primary`-tinted surface so the bar reads as a state indicator, not
 * just an overflow menu.
 *
 * Visual: a 28×28 rounded square with a **transparent** surface in both
 * states — the chip is icon-only, never a filled pill. The expanded vs.
 * collapsed distinction is carried purely by icon strength: an expanded
 * panel's chip paints its glyph at full `base-content`, a collapsed one
 * dims to `base-content/40`. Both pick up a faint `base-200` wash on
 * hover. (A previous revision filled the expanded chip with a solid
 * `primary` tint; that read as a heavy blue box fighting the calm rail
 * vocabulary, so the fill was dropped.)
 */
import type { MouseEvent, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type PanelChipProps = {
	/** Icon node (already sized — we don't override). */
	icon: ReactNode;
	/** Plain-text label used for `title` / `aria-label`. */
	label?: string;
	/**
	 * Whether the matching panel is currently expanded. Drives the
	 * primary-tinted surface — the only visual difference between
	 * "panel collapsed in the bar" and "panel open in the rail".
	 */
	expanded?: boolean;
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	className?: string;
};

export function PanelChip({
	icon,
	label,
	expanded,
	onClick,
	className,
}: PanelChipProps) {
	return (
		<button
			aria-label={label}
			aria-pressed={expanded}
			className={cn(
				"grid size-7 shrink-0 cursor-pointer place-items-center rounded-md",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				// Snap the highlight — no transition-colors. Toggling the chip
				// is a discrete action, but the convention across our overlay
				// vocabulary is "no colour-fade on interactive surfaces."
				// Transparent in both states; only icon strength differs.
				expanded
					? "text-base-content hover:bg-base-200"
					: "text-base-content/40 hover:bg-base-200 hover:text-base-content",
				className,
			)}
			onClick={onClick}
			title={label}
			type="button"
		>
			{icon}
		</button>
	);
}
