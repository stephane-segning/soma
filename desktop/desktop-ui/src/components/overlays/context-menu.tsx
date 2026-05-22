import { flip, offset, shift, useFloating } from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
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
	const { refs, floatingStyles } = useFloating({
		placement: "bottom-start",
		strategy: "fixed",
		middleware: [offset(4), flip(), shift({ padding: 8 })],
	});

	// Track the right-click point as a virtual element so @floating-ui can
	// apply flip() and shift() — preventing overflow that the old manual
	// `style={{ top, left }}` did not handle.
	// biome-ignore lint/correctness/useExhaustiveDependencies: setPositionReference is stable
	useLayoutEffect(() => {
		refs.setPositionReference({
			getBoundingClientRect: () =>
				DOMRect.fromRect({
					x: position.x,
					y: position.y,
					width: 0,
					height: 0,
				}),
		});
	}, [position.x, position.y]);

	return (
		<OverlayPortal>
			<AnimatePresence>
				{open ? (
					<>
						<div
							className="pointer-events-auto fixed inset-0 z-40"
							onMouseDown={onClose}
						/>
						{/*
						 * Animate ONLY opacity on this node.
						 *
						 * `floatingStyles` already writes `transform: translate(…)`
						 * to position the menu. If motion animated `y` or `scale`
						 * on the same element it would clobber that transform
						 * string and the menu would render detached from the
						 * anchor. `no-scale-animations.test.ts` also forbids
						 * `scale: 0.x` entries here (the polish pass found scale-in
						 * reads as "zoom on hover"). Opacity-only sidesteps both
						 * and stays in sync with the rest of our overlay vocab.
						 */}
						<motion.div
							ref={refs.setFloating}
							style={floatingStyles}
							animate={{ opacity: 1 }}
							className="pointer-events-auto z-50"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onMouseDown={(event) => event.stopPropagation()}
							transition={{ duration: 0.12, ease: "easeOut" }}
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
