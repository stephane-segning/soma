import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../utils/cn";

export type SplitPaneProps = {
	orientation?: "horizontal" | "vertical";
	initialSize?: number;
	min?: number;
	className?: string;
	left?: ReactNode;
	right?: ReactNode;
	top?: ReactNode;
	bottom?: ReactNode;
};

export function SplitPane({
	orientation = "horizontal",
	initialSize = 55,
	min = 20,
	className,
	left,
	right,
	top,
	bottom,
}: SplitPaneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState(initialSize);
	const dragging = useRef(false);

	useEffect(() => {
		const handleMove = (event: MouseEvent) => {
			if (!dragging.current || !containerRef.current) return;
			const bounds = containerRef.current.getBoundingClientRect();
			if (orientation === "horizontal") {
				const next = ((event.clientX - bounds.left) / bounds.width) * 100;
				setSize(Math.min(100 - min, Math.max(min, next)));
			} else {
				const next = ((event.clientY - bounds.top) / bounds.height) * 100;
				setSize(Math.min(100 - min, Math.max(min, next)));
			}
		};
		const handleUp = () => {
			dragging.current = false;
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [orientation, min]);

	const startDrag = () => {
		dragging.current = true;
	};

	const isHorizontal = orientation === "horizontal";

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative flex rounded-2xl border border-base-300/60 bg-base-100/60 shadow-inner backdrop-blur",
				isHorizontal ? "flex-row" : "flex-col",
				className,
			)}
		>
			<div
				className={cn("overflow-hidden", isHorizontal ? "h-full" : "")}
				style={isHorizontal ? { width: `${size}%` } : { height: `${size}%` }}
			>
				{isHorizontal ? left ?? top : top ?? left}
			</div>
			<button
				type="button"
				onMouseDown={startDrag}
				className={cn(
					"flex items-center justify-center bg-base-200/70 transition hover:bg-base-200",
					isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
				)}
				aria-label="Resize pane"
			>
				<span
					className={cn(
						"rounded-full bg-base-300",
						isHorizontal ? "h-10 w-0.5" : "h-0.5 w-10",
					)}
				/>
			</button>
			<div className="flex-1 overflow-hidden">{isHorizontal ? right ?? bottom : bottom ?? right}</div>
		</div>
	);
}
