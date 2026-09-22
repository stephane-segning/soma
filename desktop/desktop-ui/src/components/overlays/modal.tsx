import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { cn } from "../../utils/cn";
import { OverlayPortal } from "./overlay-portal";

export type ModalProps = {
	open: boolean;
	title?: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	actions?: ReactNode;
	onClose?: () => void;
	/**
	 * `"center"` (default) — the original centered dialog card,
	 * pixel-identical to before this prop existed.
	 * `"bottom"` — anchors a full-width card to the bottom edge
	 * instead, sliding up on open and padding for
	 * `env(safe-area-inset-bottom)`. For mobile pickers (e.g.
	 * `SpaceSwitcher`'s space list) where a centered dialog reads as
	 * heavier chrome than the content needs — the sheet pattern real
	 * products (Bear, Notion) use for this. Same `shadow-elevated`
	 * token either way; ADR-0005 §7's single-shadow exception covers
	 * both, it isn't a second one.
	 */
	placement?: "center" | "bottom";
};

export function Modal({
	open,
	title,
	description,
	children,
	actions,
	onClose,
	placement = "center",
}: ModalProps) {
	useHotkeys(
		"esc",
		(event) => {
			event.preventDefault();
			onClose?.();
		},
		{ enabled: open },
		[open, onClose],
	);

	const bottom = placement === "bottom";

	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<motion.div
						animate={{ opacity: 1 }}
						className={cn(
							"pointer-events-auto fixed inset-0 z-40 flex justify-center bg-neutral/40 backdrop-blur",
							bottom ? "items-end" : "items-center",
						)}
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
						transition={{ duration: 0.16 }}
					>
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className={cn(
								"glass-panel shadow-elevated",
								bottom ? "w-full p-4" : "max-w-xl p-6",
							)}
							exit={{ opacity: 0, y: bottom ? "100%" : 8 }}
							initial={{ opacity: 0, y: bottom ? "100%" : 12 }}
							onClick={(event) => event.stopPropagation()}
							style={
								bottom
									? {
											borderRadius: "12px 12px 0 0",
											paddingBottom:
												"max(1rem, env(safe-area-inset-bottom, 0px))",
										}
									: undefined
							}
							transition={{ duration: 0.2, ease: "easeOut" }}
						>
							<div className="flex items-start gap-4">
								<div className="flex-1 space-y-2">
									{title ? (
										<h2 className="font-semibold text-xl">{title}</h2>
									) : null}
									{description ? (
										<p className="text-base-content/70 text-sm">
											{description}
										</p>
									) : null}
									{children ? (
										<div className="pt-2 text-base-content/90">{children}</div>
									) : null}
								</div>
							</div>
							{actions ? (
								<div className="mt-6 flex justify-end gap-2">{actions}</div>
							) : null}
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</OverlayPortal>
	);
}
