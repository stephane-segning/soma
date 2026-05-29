import { type ReactNode, useMemo } from "react";
import { cn } from "../../utils/cn";
import { ShellPanel } from "./desktop-shell/panel";
import { useDesktopShellState } from "./desktop-shell/state";

export type DesktopShellProps = {
	leftColumn?: ReactNode;
	rightColumn?: ReactNode;
	/**
	 * Always-on, fixed-width column pinned to the far left, *outside* the
	 * collapsible `leftColumn` rail. Designed for an icon rail (e.g. the
	 * spaces rail) that must stay visible even when every inner panel is
	 * collapsed. Unlike `leftColumn`, the gutter has no resize handle and
	 * never animates closed — it sizes to its content's intrinsic width.
	 *
	 * Separating the gutter from `leftColumn` is what lets the inner rail
	 * collapse to width 0 (via `leftColumn={null}`) while the icon rail
	 * stays put — instead of leaving a dead, resizable empty column.
	 */
	leftGutter?: ReactNode;
	children?: ReactNode;
	header?: (controls: {
		leftOpen: boolean;
		rightOpen: boolean;
		toggleLeft: () => void;
		toggleRight: () => void;
		hasLeft: boolean;
		hasRight: boolean;
	}) => ReactNode;
	footer?: ReactNode;
	/**
	 * Free-form overlay layer above the entire shell. Useful for global
	 * modals, drag previews, etc.
	 */
	overlays?: ReactNode;
	/**
	 * Floating element pinned to the **top-left of the main column**
	 * (not the shell — when the left rail opens, main shrinks and this
	 * node moves with it). Designed for a `PanelChipBar`.
	 */
	mainTopLeft?: ReactNode;
	/**
	 * Floating element pinned to the **top-right of the main column**.
	 * When the right rail opens, main shrinks and this node moves with
	 * it. Designed for a `PanelChipBar`.
	 */
	mainTopRight?: ReactNode;
	className?: string;
	bodyClassName?: string;
	headerClassName?: string;
	contentClassName?: string;
	mainClassName?: string;
	defaultLeftOpen?: boolean;
	defaultRightOpen?: boolean;
	initialLeftWidth?: number;
	initialRightWidth?: number;
	/**
	 * Left rail resize bounds. The shell is "lightly resizable" on the
	 * left because the typical left content (pages, outlines) doesn't
	 * gain much from very wide rails.
	 */
	leftMinWidth?: number;
	leftMaxWidth?: number;
	/**
	 * Right rail resize bounds. Right rails host chat / inspector /
	 * tools, which want a broader range.
	 */
	rightMinWidth?: number;
	rightMaxWidth?: number;
	onLeftResizeStop?: (nextWidth: number) => void;
	onRightResizeStop?: (nextWidth: number) => void;
	storageKey?: string;
};

const DEFAULT_LEFT_MIN = 200;
const DEFAULT_LEFT_MAX = 320;
const DEFAULT_RIGHT_MIN = 280;
const DEFAULT_RIGHT_MAX = 720;

export function DesktopShell(props: DesktopShellProps) {
	const state = useDesktopShellState(props);
	const headerNode = useMemo(
		() =>
			props.header
				? props.header({
						leftOpen: state.leftOpen,
						rightOpen: state.rightOpen,
						toggleLeft: state.toggleLeft,
						toggleRight: state.toggleRight,
						hasLeft: Boolean(props.leftColumn),
						hasRight: Boolean(props.rightColumn),
					})
				: null,
		[props.header, props.leftColumn, props.rightColumn, state],
	);

	const leftMinWidth = props.leftMinWidth ?? DEFAULT_LEFT_MIN;
	const leftMaxWidth = props.leftMaxWidth ?? DEFAULT_LEFT_MAX;
	const rightMinWidth = props.rightMinWidth ?? DEFAULT_RIGHT_MIN;
	const rightMaxWidth = props.rightMaxWidth ?? DEFAULT_RIGHT_MAX;

	return (
		<div
			className={cn(
				"relative h-screen w-screen overflow-hidden bg-base-100 text-base-content",
				props.className,
			)}
		>
			{props.overlays ? (
				<div className="pointer-events-none absolute inset-0 z-20">
					{props.overlays}
				</div>
			) : null}
			<div
				className={cn(
					"relative z-10 flex h-full w-full flex-col",
					props.bodyClassName,
				)}
			>
				{headerNode ? (
					<div
						className={cn(
							"flex flex-col border-base-300 border-b bg-base-100",
							props.headerClassName,
						)}
					>
						{headerNode}
					</div>
				) : null}
				<div
					className={cn(
						"flex min-h-0 flex-1 items-start overflow-hidden",
						props.contentClassName,
					)}
				>
					{props.leftGutter ? (
						// Always-on icon rail. `shrink-0` + intrinsic width so it
						// never collapses with the resizable inner rail beside it.
						<div className="flex h-full shrink-0">{props.leftGutter}</div>
					) : null}
					<ShellPanel
						content={props.leftColumn}
						maxWidth={leftMaxWidth}
						minWidth={leftMinWidth}
						onResizeStop={(next) => {
							state.setLeftWidth(next);
							props.onLeftResizeStop?.(next);
						}}
						open={state.leftOpen}
						side="left"
						width={state.leftWidth}
					/>
					{/* Main column. Two-layer structure: the OUTER `<main>` is
					    `relative` and `overflow-hidden`; the INNER scroll
					    container holds the scrollable children. The
					    `mainTopLeft` / `mainTopRight` slots are absolutely
					    positioned against the outer `<main>`, *outside* the
					    scrollable inner — so they stay pinned to the visible
					    top corners no matter how far the user scrolls.
					    Previous revisions nested the overlays inside the same
					    element that owned `overflow-auto`, which made the
					    chip bars disappear once the doc was scrolled
					    (eliminating the only affordance to re-open collapsed
					    panels). The `<main>` element still owns the
					    `mainClassName` so callers can theme the surface as
					    before. */}
					<main
						className={cn(
							"relative max-h-full min-h-0 flex-1 overflow-hidden",
							props.mainClassName,
						)}
					>
						<div className="h-full w-full overflow-auto">{props.children}</div>
						{props.mainTopLeft ? (
							<div className="pointer-events-none absolute top-2 left-2 z-10">
								<div className="pointer-events-auto">{props.mainTopLeft}</div>
							</div>
						) : null}
						{props.mainTopRight ? (
							<div className="pointer-events-none absolute top-2 right-2 z-10">
								<div className="pointer-events-auto">{props.mainTopRight}</div>
							</div>
						) : null}
					</main>
					<ShellPanel
						content={props.rightColumn}
						maxWidth={rightMaxWidth}
						minWidth={rightMinWidth}
						onResizeStop={(next) => {
							state.setRightWidth(next);
							props.onRightResizeStop?.(next);
						}}
						open={state.rightOpen}
						side="right"
						width={state.rightWidth}
					/>
				</div>
				{props.footer ? <div>{props.footer}</div> : null}
			</div>
		</div>
	);
}
