import { Resizable } from "re-resizable";
import type { ReactNode } from "react";
import {
	MAX_PANEL_WIDTH,
	MIN_PANEL_WIDTH,
	normalizePanelWidth,
} from "./constants";
import { ResizeHandle } from "./resize-handle";

type ShellPanelProps = {
	content?: ReactNode;
	open: boolean;
	side: "left" | "right";
	width: number;
	onResizeStop: (nextWidth: number) => void;
};

/**
 * One of the shell's two side rails. The visible divider lives on the
 * `ResizeHandle` (a hairline), not on this wrapper — earlier revisions
 * added a `border-l` / `border-r` here too, which gave us two stacked
 * dividers per side. Now the rail itself is borderless; the only line
 * between rail and main content is the handle.
 */
export function ShellPanel({
	content,
	open,
	side,
	width,
	onResizeStop,
}: ShellPanelProps) {
	if (!content) return null;

	const enable = side === "left" ? { right: true } : { left: true };
	const handleComponent =
		side === "left" ? { right: <ResizeHandle /> } : { left: <ResizeHandle /> };

	return (
		<div className="relative flex h-full shrink-0">
			{open ? (
				<Resizable
					className="h-full"
					enable={enable}
					handleComponent={handleComponent}
					maxWidth={MAX_PANEL_WIDTH}
					minWidth={MIN_PANEL_WIDTH}
					onResizeStop={(_, __, ref) =>
						onResizeStop(normalizePanelWidth(ref.offsetWidth, width))
					}
					size={{ width, height: "100%" }}
				>
					<aside className="scrollbar-none relative h-full overflow-auto">
						{content}
					</aside>
				</Resizable>
			) : null}
		</div>
	);
}
