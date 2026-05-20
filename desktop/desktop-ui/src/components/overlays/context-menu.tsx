import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { OverlayPosition } from "../../types";
import { MenuItem, MenuShell } from "./menu-shell";
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
							animate={{ opacity: 1 }}
							className="pointer-events-auto fixed z-50 origin-top-left"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onMouseDown={(event) => event.stopPropagation()}
							style={{ top: position.y, left: position.x }}
							transition={{ duration: 0.12 }}
						>
							<MenuShell className={className}>
								{items.map((item) => (
									<MenuItem
										key={item.id}
										disabled={item.disabled}
										icon={item.icon}
										label={item.label}
										onClick={() => {
											item.onSelect?.();
											onClose?.();
										}}
										shortcut={item.shortcut}
										tone={item.tone === "danger" ? "danger" : "default"}
									/>
								))}
							</MenuShell>
						</motion.div>
					</>
				) : null}
			</AnimatePresence>
		</OverlayPortal>
	);
}
