import { Resizable } from "re-resizable";
import { type ReactNode, useMemo, useState } from "react";
import { cn } from "../../utils/cn";

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
	variant?: "default" | "flat";
	defaultLeftOpen?: boolean;
	defaultRightOpen?: boolean;
	initialLeftWidth?: number;
	initialRightWidth?: number;
	onLeftResizeStop?: (nextWidth: number) => void;
	onRightResizeStop?: (nextWidth: number) => void;
};

function ResizeHandle() {
	const [hover, setHover] = useState(false);

	return (
		<div
			className={cn(
				"flex h-full w-2.5 cursor-col-resize items-center justify-center rounded-md transition-all duration-150",
				hover ? "bg-slate-400/20" : "bg-transparent",
			)}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			role="none"
		>
			<span
				className={cn(
					"h-10 rounded-full bg-base-300 transition-all duration-150",
					hover ? "w-1.5" : "w-px",
				)}
			/>
		</div>
	);
}

export function DesktopShell({
	leftColumn,
	rightColumn,
	children,
	header,
	footer,
	overlays,
	className,
	initialLeftWidth = 240,
	initialRightWidth = 260,
	onLeftResizeStop,
	onRightResizeStop,
	bodyClassName,
	headerClassName,
	contentClassName,
	mainClassName,
	variant = "default",
	defaultLeftOpen = true,
	defaultRightOpen = true,
}: DesktopShellProps) {
	const [leftOpen, setLeftOpen] = useState(defaultLeftOpen);
	const [rightOpen, setRightOpen] = useState(defaultRightOpen);
	const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
	const [rightWidth, setRightWidth] = useState(initialRightWidth);
	const isFlat = variant === "flat";
	const leftContent = useMemo(
		() => (leftOpen ? leftColumn : null),
		[leftOpen, leftColumn],
	);
	const rightContent = useMemo(
		() => (rightOpen ? rightColumn : null),
		[rightOpen, rightColumn],
	);
	const headerNode = useMemo(
		() =>
			header
				? header({
						leftOpen,
						rightOpen,
						toggleLeft: () => setLeftOpen((open) => !open),
						toggleRight: () => setRightOpen((open) => !open),
						hasLeft: Boolean(leftColumn),
						hasRight: Boolean(rightColumn),
					})
				: null,
		[header, leftOpen, rightOpen, leftColumn, rightColumn],
	);

	return (
		<div
			className={`relative h-screen w-screen overflow-hidden bg-base-100 text-base-content ${className ?? ""}`}
		>
			{overlays ? (
				<div className="pointer-events-none absolute inset-0 z-20">
					{overlays}
				</div>
			) : null}

			<div
				className={cn(
					"relative z-10 flex h-full w-full flex-col",
					isFlat ? "" : "gap-4",
					bodyClassName,
				)}
			>
				{headerNode ? (
					<div
						className={cn(
							"flex flex-col",
							isFlat ? "" : "gap-2",
							headerClassName,
						)}
					>
						{headerNode}
					</div>
				) : null}
				<div
					className={cn(
						"flex min-h-0 flex-1 items-start overflow-hidden",
						contentClassName,
					)}
				>
					{leftColumn ? (
						<div className="relative flex h-full shrink-0">
							{leftOpen && (
								<Resizable
									className="h-full"
									enable={{ right: true }}
									handleComponent={{
										right: <ResizeHandle />,
									}}
									maxWidth={640}
									minWidth={80}
									onResizeStop={(_, __, ref) => {
										const next = ref.offsetWidth;
										setLeftWidth(next);
										onLeftResizeStop?.(next);
									}}
									size={{ width: leftWidth, height: "100%" }}
								>
									<div className="scrollbar-none relative h-full overflow-auto border-base-300 border-r">
										<aside className="h-full">{leftContent}</aside>
									</div>
								</Resizable>
							)}
						</div>
					) : null}

					<main
						className={cn(
							"max-h-full min-h-0 flex-1 overflow-auto",
							isFlat ? "" : "space-y-4",
							mainClassName,
						)}
					>
						{children}
					</main>

					{rightColumn ? (
						<div className="relative h-full shrink-0">
							{rightOpen && (
								<Resizable
									className="h-full"
									enable={{ left: true }}
									handleComponent={{
										left: <ResizeHandle />,
									}}
									maxWidth={640}
									minWidth={80}
									onResizeStop={(_, __, ref) => {
										const next = ref.offsetWidth;
										setRightWidth(next);
										onRightResizeStop?.(next);
									}}
									size={{ width: rightWidth, height: "100%" }}
								>
									<div className="scrollbar-none relative h-full overflow-auto border-base-300 border-l">
										<aside className="h-full">{rightContent}</aside>
									</div>
								</Resizable>
							)}
						</div>
					) : null}
				</div>
				{footer ? <div>{footer}</div> : null}
			</div>
		</div>
	);
}
