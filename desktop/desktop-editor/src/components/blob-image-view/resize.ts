import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_HEIGHT, MAX_WIDTH, MIN_HEIGHT, MIN_WIDTH } from "./constants";
import type { ImageLayout } from "./types";

type UseImageResizeInput = {
	containerRef: React.RefObject<HTMLDivElement | null>;
	layout: { effectiveLayout: ImageLayout };
	updateAttributes: (attrs: Record<string, unknown>) => void;
};

export function useImageResize({ containerRef, layout, updateAttributes }: UseImageResizeInput) {
	const [isResizing, setIsResizing] = useState(false);
	const resizeStartRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; layout: ImageLayout } | null>(null);

	useEffect(() => {
		if (!isResizing) return;
		const handlePointerMove = (event: PointerEvent) => {
			const start = resizeStartRef.current;
			if (!start) return;
			if (start.layout === "cover") {
				const nextHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, start.startHeight + (event.clientY - start.startY)));
				updateAttributes({ displayHeight: Math.round(nextHeight) });
				return;
			}
			const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, start.startWidth + (event.clientX - start.startX)));
			updateAttributes({ displayWidth: Math.round(nextWidth) });
		};
		const handlePointerUp = () => {
			setIsResizing(false);
			resizeStartRef.current = null;
		};
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};
	}, [isResizing, updateAttributes]);

	return useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (!containerRef.current) return;
			event.preventDefault();
			event.stopPropagation();
			const rect = containerRef.current.getBoundingClientRect();
			resizeStartRef.current = {
				startX: event.clientX,
				startY: event.clientY,
				startWidth: rect.width,
				startHeight: rect.height,
				layout: layout.effectiveLayout,
			};
			setIsResizing(true);
		},
		[containerRef, layout.effectiveLayout],
	);
}
