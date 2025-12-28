import { AnimatePresence, motion } from "motion/react";
import { type ReactNode } from "react";
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
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.16 }}
						className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-neutral/40 backdrop-blur"
						onClick={onClose}
					>
						<motion.div
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 8 }}
							transition={{ duration: 0.16, ease: "easeOut" }}
							onClick={(event) => event.stopPropagation()}
							className="glass-panel max-w-xl rounded-2xl p-6 shadow-2xl"
						>
							<div className="flex items-start gap-4">
								<div className="flex-1 space-y-2">
									{title ? (
										<h2 className="text-xl font-semibold">{title}</h2>
									) : null}
									{description ? (
										<p className="text-sm text-base-content/70">
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
