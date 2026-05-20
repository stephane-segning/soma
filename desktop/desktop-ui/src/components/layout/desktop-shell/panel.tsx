import { Resizable } from "re-resizable";
import type { ReactNode } from "react";
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
 * in on hover) — the rail itself has no border. Earlier revisions
 * added `border-l` / `border-r` here too, which gave us a visible
 * static line cutting through the floating-card aesthetic.
 *
 * **Auto-unmount contract.** Pass `content={null}` (or `undefined`)
 * when the rail has nothing to show, and ShellPanel returns `null`
 * — the rail's width collapses to 0 and the persisted width is
 * restored on the next mount. Callers use this to make the rail
 * disappear when every panel is collapsed into the matching chip
 * bar (see `DesktopShell` + `PanelContainer` docs).
 *
 * The per-side `minWidth` / `maxWidth` are passed from `DesktopShell`
 * (defaults: 200-320 px on the left, 280-720 px on the right), so the
 * left rail is "lightly resizable" while the right has more room.
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
	if (!content) return null;
	if (!open) return null;

	const enable = side === "left" ? { right: true } : { left: true };
	const handleComponent =
		side === "left" ? { right: <ResizeHandle /> } : { left: <ResizeHandle /> };

	return (
		<div className="relative flex h-full shrink-0">
			<Resizable
				className="h-full"
				enable={enable}
				handleComponent={handleComponent}
				maxWidth={maxWidth}
				minWidth={minWidth}
				onResizeStop={(_, __, ref) =>
					onResizeStop(
						normalizePanelWidth(ref.offsetWidth, width, minWidth, maxWidth),
					)
				}
				size={{ width, height: "100%" }}
			>
				<aside className="scrollbar-none relative h-full overflow-auto">
					{content}
				</aside>
			</Resizable>
		</div>
	);
}
