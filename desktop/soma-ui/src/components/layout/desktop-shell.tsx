import { Resizable } from "re-resizable";
import { type ReactNode, useMemo, useState } from "react";

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
};

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
}: DesktopShellProps) {
	const [leftOpen, setLeftOpen] = useState(true);
	const [rightOpen, setRightOpen] = useState(true);
	const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
	const [rightWidth, setRightWidth] = useState(initialRightWidth);
	const [leftHover, setLeftHover] = useState(false);
	const [rightHover, setRightHover] = useState(false);

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
			className={`relative min-h-screen bg-base-100 text-base-content ${className ?? ""}`}
		>
			{overlays ? (
				<div className="pointer-events-none absolute inset-0 z-20">
					{overlays}
				</div>
			) : null}
			<div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
				{headerNode ? (
					<div className="flex flex-col gap-2">{headerNode}</div>
				) : null}
				<div className="flex w-full items-start gap-4">
					{leftColumn ? (
						<div className="relative flex-shrink-0">
							{leftOpen ? (
								<Resizable
									className="h-full"
									enable={{ right: true }}
									handleComponent={{
										right: (
											<div
												onMouseEnter={() => setLeftHover(true)}
												onMouseLeave={() => setLeftHover(false)}
												style={{
													width: "10px",
													height: "100%",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													background: leftHover
														? "rgba(148,163,184,0.2)"
														: "transparent",
													cursor: "col-resize",
													borderRadius: "6px",
													transition: "all 120ms ease",
												}}
											>
												<span
													style={{
														width: leftHover ? "6px" : "3px",
														height: "48px",
														borderRadius: "999px",
														background: "rgba(107,114,128,0.8)",
														transition: "all 120ms ease",
													}}
												/>
											</div>
										),
									}}
									handleStyles={{
										right: {
											cursor: "col-resize",
											width: "10px",
											background: "transparent",
										},
									}}
									maxWidth={420}
									minWidth={80}
									onResizeStop={(_, __, ref) => setLeftWidth(ref.offsetWidth)}
									size={{ width: leftWidth, height: "100%" }}
								>
									<div className="relative h-full overflow-auto pr-2">
										<aside className="h-full pr-4">{leftContent}</aside>
									</div>
								</Resizable>
							) : null}
						</div>
					) : null}

					<main className="min-h-[320px] flex-1 space-y-4">{children}</main>

					{rightColumn ? (
						<div className="relative flex-shrink-0">
							{rightOpen ? (
								<Resizable
									className="h-full"
									enable={{ left: true }}
									handleComponent={{
										left: (
											<div
												onMouseEnter={() => setRightHover(true)}
												onMouseLeave={() => setRightHover(false)}
												style={{
													width: "10px",
													height: "100%",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													background: rightHover
														? "rgba(148,163,184,0.2)"
														: "transparent",
													cursor: "col-resize",
													borderRadius: "6px",
													transition: "all 120ms ease",
												}}
											>
												<span
													style={{
														width: rightHover ? "6px" : "3px",
														height: "48px",
														borderRadius: "999px",
														background: "rgba(107,114,128,0.8)",
														transition: "all 120ms ease",
													}}
												/>
											</div>
										),
									}}
									handleStyles={{
										left: {
											cursor: "col-resize",
											width: "10px",
											background: "transparent",
										},
									}}
									maxWidth={400}
									minWidth={180}
									onResizeStop={(_, __, ref) => setRightWidth(ref.offsetWidth)}
									size={{ width: rightWidth, height: "100%" }}
								>
									<div className="relative h-full overflow-auto pl-2">
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
