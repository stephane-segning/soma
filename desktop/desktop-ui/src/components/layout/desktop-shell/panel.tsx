import { Resizable } from "re-resizable";
import type { ReactNode } from "react";
import { MAX_PANEL_WIDTH, MIN_PANEL_WIDTH, normalizePanelWidth } from "./constants";
import { ResizeHandle } from "./resize-handle";

type ShellPanelProps = {
	content?: ReactNode;
	open: boolean;
	side: "left" | "right";
	width: number;
	onResizeStop: (nextWidth: number) => void;
};

export function ShellPanel({ content, open, side, width, onResizeStop }: ShellPanelProps) {
	if (!content) return null;

	const borderClass = side === "left" ? "border-r" : "border-l";
	const enable = side === "left" ? { right: true } : { left: true };
	const handleComponent = side === "left" ? { right: <ResizeHandle /> } : { left: <ResizeHandle /> };

	return (
		<div className="relative flex h-full shrink-0">
			{open ? (
				<Resizable
					className="h-full"
					enable={enable}
					handleComponent={handleComponent}
					maxWidth={MAX_PANEL_WIDTH}
					minWidth={MIN_PANEL_WIDTH}
					onResizeStop={(_, __, ref) => onResizeStop(normalizePanelWidth(ref.offsetWidth, width))}
					size={{ width, height: "100%" }}
				>
					<div className={`scrollbar-none relative h-full overflow-auto border-base-300 ${borderClass}`}>
						<aside className="h-full">{content}</aside>
					</div>
				</Resizable>
			) : null}
		</div>
	);
}
