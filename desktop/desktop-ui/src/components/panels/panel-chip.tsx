/**
 * PanelChip — one icon button in the floating `PanelChipBar`.
 *
 * The chip is **persistent** for every registered panel — clicking it
 * toggles the matching panel open or closed. When the panel is open
 * (its id is in the bar's `expandedIds`), the chip renders with a
 * `primary`-tinted surface so the bar reads as a state indicator, not
 * just an overflow menu.
 *
 * Visual: a 28×28 rounded square. Resting state is a muted icon glyph
 * that picks up `base-200` on hover. Expanded state swaps the resting
 * fill for a soft primary tint that still responds to hover.
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
				"grid size-7 shrink-0 place-items-center rounded-md",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				// Snap the highlight — no transition-colors. Toggling the chip
				// is a discrete action, but the convention across our overlay
				// vocabulary is "no colour-fade on interactive surfaces."
				expanded
					? "bg-primary/15 text-primary hover:bg-primary/20"
					: "text-base-content/70 hover:bg-base-200 hover:text-base-content",
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
