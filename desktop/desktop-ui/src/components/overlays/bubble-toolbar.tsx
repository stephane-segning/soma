import { flip, offset, shift, useFloating } from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
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
	const { refs, floatingStyles } = useFloating({
		placement: "top",
		strategy: "fixed",
		middleware: [offset(6), flip(), shift({ padding: 8 })],
	});

	// Virtual element anchors the toolbar to the selection point.
	// flip() falls back below if there is no room above; shift() keeps
	// the toolbar inside the viewport on narrow lines.
	// biome-ignore lint/correctness/useExhaustiveDependencies: setPositionReference is stable
	useLayoutEffect(() => {
		refs.setPositionReference({
			getBoundingClientRect: () =>
				DOMRect.fromRect({
					x: anchor.x,
					y: anchor.y,
					width: 0,
					height: 0,
				}),
		});
	}, [anchor.x, anchor.y]);

	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<motion.div
						ref={refs.setFloating}
						style={floatingStyles}
						animate={{ opacity: 1, y: 0 }}
						className="pointer-events-auto z-50"
						exit={{ opacity: 0, y: 4 }}
						initial={{ opacity: 0, y: 4 }}
						transition={{ duration: 0.12, ease: "easeOut" }}
					>
						<div
							className={cn(
								"glass-panel shadow-elevated flex items-center gap-1 p-1",
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
