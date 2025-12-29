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
		>
			<span
				className={cn(
					"h-12 rounded-full bg-gray-600/80 transition-all duration-150",
					hover ? "w-1.5" : "w-0.75",
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
}: DesktopShellProps) {
	const [leftOpen, setLeftOpen] = useState(true);
	const [rightOpen, setRightOpen] = useState(true);
	const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
	const [rightWidth, setRightWidth] = useState(initialRightWidth);
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
			<div className="relative z-10 flex h-full w-full flex-col gap-4 sm:p-6 lg:p-8">
				{headerNode ? (
					<div className="flex flex-col gap-2">{headerNode}</div>
				) : null}
				<div className="flex min-h-0 flex-1 items-start gap-4 overflow-hidden">
					{leftColumn ? (
						<div className="relative flex h-full shrink-0">
							{leftOpen ? (
								<Resizable
									className="h-full"
									enable={{ right: true }}
									handleComponent={{
										right: <ResizeHandle />,
									}}
									maxWidth={420}
									minWidth={80}
									onResizeStop={(_, __, ref) => {
										const next = ref.offsetWidth;
										setLeftWidth(next);
										onLeftResizeStop?.(next);
									}}
									size={{ width: leftWidth, height: "100%" }}
								>
									<div className="scrollbar-none relative h-full overflow-auto pr-2">
										<aside className="h-full pr-4">{leftContent}</aside>
									</div>
								</Resizable>
							) : null}
						</div>
					) : null}

					<main className="max-h-full min-h-0 flex-1 space-y-4 overflow-auto">
						{children}
					</main>

					{rightColumn ? (
						<div className="relative h-full shrink-0">
							{rightOpen ? (
								<Resizable
									className="h-full"
									enable={{ left: true }}
									handleComponent={{
										left: <ResizeHandle />,
									}}
									maxWidth={400}
									minWidth={180}
									onResizeStop={(_, __, ref) => {
										const next = ref.offsetWidth;
										setRightWidth(next);
										onRightResizeStop?.(next);
									}}
									size={{ width: rightWidth, height: "100%" }}
								>
									<div className="scrollbar-none relative h-full overflow-auto pl-2">
										<aside className="h-full pl-4">{rightContent}</aside>
									</div>
								</Resizable>
							) : (
								<button
									aria-label="Show right panel"
									className="btn btn-ghost btn-xs rounded-full bg-base-100 shadow"
									onClick={() => setRightOpen(true)}
									type="button"
								>
									ℹ
								</button>
							)}
						</div>
					) : null}
				</div>
				{footer ? <div>{footer}</div> : null}
			</div>
		</div>
	);
}
