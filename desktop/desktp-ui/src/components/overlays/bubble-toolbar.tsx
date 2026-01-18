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

export function BubbleToolbar({
	open,
	anchor,
	actions,
	className,
}: BubbleToolbarProps) {
	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						className="pointer-events-auto fixed z-50"
						exit={{ opacity: 0, scale: 0.95 }}
						initial={{ opacity: 0, scale: 0.95 }}
						style={{ top: anchor.y, left: anchor.x }}
						transition={{ duration: 0.12 }}
					>
						<div
							className={cn(
								"glass-panel flex items-center gap-1 rounded-xl p-1 shadow-2xl",
								className,
							)}
						>
							{actions.map((action) => (
								<button
									aria-label={action.label}
									className={cn(
										"btn btn-ghost btn-xs grid h-9 w-9 place-items-center rounded-lg",
										action.active && "bg-base-200 text-primary",
									)}
									key={action.id}
									onClick={action.onSelect}
									type="button"
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
