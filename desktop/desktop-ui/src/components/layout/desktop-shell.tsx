import { type ReactNode, useMemo } from "react";
import { cn } from "../../utils/cn";
import { ShellPanel } from "./desktop-shell/panel";
import { useDesktopShellState } from "./desktop-shell/state";

export type DesktopShellProps = {
	leftColumn?: ReactNode;
	rightColumn?: ReactNode;
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
	overlays?: ReactNode;
	className?: string;
	bodyClassName?: string;
	headerClassName?: string;
	contentClassName?: string;
	mainClassName?: string;
	defaultLeftOpen?: boolean;
	defaultRightOpen?: boolean;
	initialLeftWidth?: number;
	initialRightWidth?: number;
	onLeftResizeStop?: (nextWidth: number) => void;
	onRightResizeStop?: (nextWidth: number) => void;
	storageKey?: string;
};

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
					<ShellPanel
						content={props.leftColumn}
						onResizeStop={(next) => {
							state.setLeftWidth(next);
							props.onLeftResizeStop?.(next);
						}}
						open={state.leftOpen}
						side="left"
						width={state.leftWidth}
					/>
					<main
						className={cn(
							"max-h-full min-h-0 flex-1 overflow-auto",
							props.mainClassName,
						)}
					>
						{props.children}
					</main>
					<ShellPanel
						content={props.rightColumn}
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
