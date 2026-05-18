import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { OverlayPosition } from "../../types";
import { cn } from "../../utils/cn";
import { OverlayPortal } from "./overlay-portal";

export type ContextMenuItem = {
	id: string;
	label: string;
	icon?: ReactNode;
	shortcut?: string;
	tone?: "default" | "danger" | "muted";
	onSelect?: () => void;
	disabled?: boolean;
};

export type ContextMenuProps = {
	open: boolean;
	position: OverlayPosition;
	items: ContextMenuItem[];
	onClose?: () => void;
	className?: string;
};

export function ContextMenu({
	open,
	position,
	items,
	onClose,
	className,
}: ContextMenuProps) {
	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<>
						<div
							className="pointer-events-auto fixed inset-0 z-40"
							onMouseDown={onClose}
						/>
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="pointer-events-auto fixed z-50 origin-top-left"
							exit={{ opacity: 0, scale: 0.96 }}
							initial={{ opacity: 0, scale: 0.96 }}
							onMouseDown={(event) => event.stopPropagation()}
							style={{ top: position.y, left: position.x }}
							transition={{ duration: 0.12 }}
						>
							<div
								className={cn(
									"glass-panel shadow-elevated min-w-48 p-2",
									className,
								)}
							>
								{items.map((item) => (
									<button
										className={cn(
											"group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
											item.tone === "danger"
												? "hover:bg-error hover:text-error-content"
												: "hover:bg-base-200",
											item.disabled
												? "cursor-not-allowed opacity-50"
												: "cursor-pointer",
										)}
										disabled={item.disabled}
										key={item.id}
										onClick={() => {
											item.onSelect?.();
											onClose?.();
										}}
										type="button"
									>
										<span className="text-base-content/70">{item.icon}</span>
										<span className="flex-1">{item.label}</span>
										{item.shortcut ? (
											<span className="text-base-content/60 text-xs">
												{item.shortcut}
											</span>
										) : null}
									</button>
								))}
							</div>
						</motion.div>
					</>
				) : null}
			</AnimatePresence>
		</OverlayPortal>
	);
}
