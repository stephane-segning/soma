import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { OverlayPortal } from "./overlay-portal";

export type BubbleAction = {
	id: string;
	icon: ReactNode;
	label: string;
	onSelect?: () => void;
	active?: boolean;
};

export type BubbleToolbarProps = {
	open: boolean;
	anchor: { x: number; y: number };
	actions: BubbleAction[];
	className?: string;
};

export function BubbleToolbar({ open, anchor, actions, className }: BubbleToolbarProps) {
	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.12 }}
						className="pointer-events-auto fixed z-50"
						style={{ top: anchor.y, left: anchor.x }}
					>
						<div className={cn("glass-panel flex items-center gap-1 rounded-xl p-1 shadow-2xl", className)}>
							{actions.map((action) => (
								<button
									key={action.id}
									type="button"
									onClick={action.onSelect}
									className={cn(
										"btn btn-ghost btn-xs grid h-9 w-9 place-items-center rounded-lg",
										action.active && "bg-base-200 text-primary",
									)}
									aria-label={action.label}
								>
									{action.icon}
								</button>
							))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</OverlayPortal>
	);
}
