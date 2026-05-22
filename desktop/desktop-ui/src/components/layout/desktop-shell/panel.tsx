import { AnimatePresence, motion } from "motion/react";
import { Resizable } from "re-resizable";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { normalizePanelWidth } from "./constants";
import { ResizeHandle } from "./resize-handle";

type ShellPanelProps = {
	content?: ReactNode;
	open: boolean;
	side: "left" | "right";
	width: number;
	minWidth: number;
	maxWidth: number;
	onResizeStop: (nextWidth: number) => void;
};

/**
 * One of the shell's two side rails. The visible divider lives on the
 * `ResizeHandle` (a hairline that's *invisible at rest*, only fading
 * in on hover) — the rail itself has no border.
 *
 * **Auto-unmount contract.** Pass `content={null}` (or `undefined`)
 * when the rail has nothing to show, and ShellPanel renders nothing —
 * the rail collapses to 0 width and the persisted width is restored on
 * the next mount.
 *
 * **Motion contract.** The rail toggles open/closed via motion: width
 * animates from 0 to `width` (and back to 0 on close) over 180 ms.
 * During an active resize-drag, the animation is suppressed (transition
 * duration drops to 0) so the handle tracks the cursor frame-perfect;
 * once the user releases, the next external `width` change re-animates.
 * This keeps the "open/close slides" effect without ever fighting the
 * `re-resizable` drag feedback loop.
 */
export function ShellPanel({
	content,
	open,
	side,
	width,
	minWidth,
	maxWidth,
	onResizeStop,
}: ShellPanelProps) {
	const enable = side === "left" ? { right: true } : { left: true };
	const handleComponent =
		side === "left" ? { right: <ResizeHandle /> } : { left: <ResizeHandle /> };

	// liveWidth is the width motion animates toward. It tracks the
	// committed `width` prop EXCEPT during an active drag, where it
	// follows the in-flight `onResize` callback so the outer wrapper
	// stays in lock-step with the inner Resizable's DOM width.
	const [liveWidth, setLiveWidth] = useState(width);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		if (!dragging) setLiveWidth(width);
	}, [width, dragging]);

	if (!content) return null;

	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					key={side}
					animate={{ width: liveWidth }}
					className="relative flex h-full shrink-0 overflow-hidden"
					exit={{ width: 0 }}
					initial={{ width: 0 }}
					transition={{
						// During a drag, snap (duration 0) so the wrapper width
						// matches the Resizable's DOM width frame-perfect. Open /
						// close transitions get the 0.18 s slide.
						width: { duration: dragging ? 0 : 0.18, ease: "easeOut" },
					}}
				>
					<Resizable
						className="h-full"
						enable={enable}
						handleComponent={handleComponent}
						maxWidth={maxWidth}
						minWidth={minWidth}
						onResize={(_, __, ref) => setLiveWidth(ref.offsetWidth)}
						onResizeStart={() => setDragging(true)}
						onResizeStop={(_, __, ref) => {
							const next = normalizePanelWidth(
								ref.offsetWidth,
								width,
								minWidth,
								maxWidth,
							);
							setLiveWidth(next);
							setDragging(false);
							onResizeStop(next);
						}}
						size={{ width: liveWidth, height: "100%" }}
					>
						<aside className="scrollbar-none relative h-full overflow-auto">
							{content}
						</aside>
					</Resizable>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
