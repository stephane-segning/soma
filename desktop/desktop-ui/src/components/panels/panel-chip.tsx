/**
 * PanelChip — one icon button in a floating `PanelChipBar`.
 *
 * It's not a tab: a chip only exists in the bar for **collapsed**
 * panels. Clicking it expands the panel into the rail, at which point
 * this chip is removed from the bar entirely (its role is replaced by
 * the visible Panel card + its `−` collapse button).
 *
 * Visual: a 28×28 rounded square that lives inside a floating chip
 * bar with a blurred translucent background. Hover gets a slightly
 * stronger fill — no scale, no glow.
 */
import type { MouseEvent, ReactNode } from "react";
import { cn } from "../../utils/cn";

export type PanelChipProps = {
	/** Icon node (already sized — we don't override). */
	icon: ReactNode;
	/** Plain-text label used for `title` / `aria-label`. */
	label?: string;
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	className?: string;
};

export function PanelChip({ icon, label, onClick, className }: PanelChipProps) {
	return (
		<button
			aria-label={label}
			className={cn(
				"grid size-7 shrink-0 place-items-center rounded-md text-base-content/70",
				"hover:bg-base-200 hover:text-base-content",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
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
