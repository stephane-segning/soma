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
 * when the rail has nothing to show. The rail then animates closed via
 * `AnimatePresence` (width slides to 0) and unmounts after the exit
 * completes — same behaviour as toggling `open={false}` from a header
 * button. Both signals flow through the same motion path, so the user
 * never sees the rail snap shut just because the last panel was
 * collapsed.
 *
 * **Motion contract.** width animates from 0 → `width` on open / reverse
 * on close, 180 ms easeOut. During an active resize-drag, transition
 * duration drops to 0 so the wrapper tracks `re-resizable`'s
 * `onResize` callback frame-perfect; once the user releases, the next
 * external width change re-animates.
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

	const [liveWidth, setLiveWidth] = useState(width);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		if (!dragging) setLiveWidth(width);
	}, [width, dragging]);

	// `content` is part of the visibility condition (NOT an early return)
	// so AnimatePresence can play the exit animation when content goes
	// from non-null to null — the rail slides closed instead of snapping.
	const shouldShow = open && Boolean(content);

	return (
		<AnimatePresence initial={false}>
			{shouldShow ? (
				<motion.div
					animate={{ width: liveWidth }}
					className="relative flex h-full shrink-0 overflow-hidden"
					exit={{ width: 0 }}
					initial={{ width: 0 }}
					key={side}
					transition={{
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
