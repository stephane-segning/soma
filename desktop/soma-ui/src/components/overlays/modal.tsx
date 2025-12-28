import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { OverlayPortal } from "./overlay-portal";

export type ModalProps = {
	open: boolean;
	title?: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	actions?: ReactNode;
	onClose?: () => void;
};

export function Modal({
	open,
	title,
	description,
	children,
	actions,
	onClose,
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

	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<motion.div
						animate={{ opacity: 1 }}
						className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-neutral/40 backdrop-blur"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
						transition={{ duration: 0.16 }}
					>
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="glass-panel max-w-xl rounded-2xl p-6 shadow-2xl"
							exit={{ opacity: 0, y: 8 }}
							initial={{ opacity: 0, y: 12 }}
							onClick={(event) => event.stopPropagation()}
							transition={{ duration: 0.16, ease: "easeOut" }}
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
