import {
	ContextMenu,
	type ContextMenuItem,
} from "@soma/ui/components/overlays/context-menu";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, Crop, Maximize2, MoreHorizontal } from "react-feather";

const MIN_WIDTH = 240;
const MAX_WIDTH = 1400;
const MIN_HEIGHT = 180;
const MAX_HEIGHT = 800;

type ImageLayout = "full" | "center" | "cover";
type ImageSource = {
	src: string;
	alt?: string;
	width?: number;
	height?: number;
};

export function BlobImageView({
	node,
	deleteNode,
	updateAttributes,
}: NodeViewProps): React.JSX.Element {
	const src = node.attrs.src as string | undefined;
	const name = node.attrs.name as string | undefined;
	const error = node.attrs.error as string | undefined;
	const width = node.attrs.width as number | undefined;
	const height = node.attrs.height as number | undefined;
	const displayWidth = node.attrs.displayWidth as number | null;
	const displayHeight = node.attrs.displayHeight as number | null;
	const layout = (node.attrs.layout as ImageLayout | undefined) ?? "center";
	const sources = useMemo<ImageSource[]>(() => {
		const raw = node.attrs.sources as ImageSource[] | undefined | null;
		if (raw && raw.length > 0) return raw;
		if (src) return [{ src, alt: name, width, height }];
		return [];
	}, [height, name, node.attrs.sources, src, width]);
	const effectiveLayout =
		sources.length > 1 && layout === "cover" ? "center" : layout;
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
	const [isResizing, setIsResizing] = useState(false);
	const resizeStartRef = useRef<{
		startX: number;
		startY: number;
		startWidth: number;
		startHeight: number;
		layout: ImageLayout;
	} | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);

	const closeMenu = useCallback(() => setMenuOpen(false), []);

	const menuItems = useMemo<ContextMenuItem[]>(
		() => [
			{
				id: "layout-full",
				label: "Full width",
				icon: <Maximize2 className="size-4" />,
				onSelect: () =>
					updateAttributes({
						layout: "full",
						displayWidth: null,
					}),
			},
			{
				id: "layout-center",
				label: "Centered",
				icon: <AlignCenter className="size-4" />,
				onSelect: () =>
					updateAttributes({
						layout: "center",
						displayWidth: displayWidth ?? Math.min(width ?? 720, 720),
					}),
			},
			{
				id: "layout-cover",
				label: "Cover",
				icon: <Crop className="size-4" />,
				onSelect: () =>
					updateAttributes({
						layout: "cover",
						displayHeight: displayHeight ?? 320,
						displayWidth: null,
					}),
			},
		],
		[displayHeight, displayWidth, updateAttributes, width],
	);

	const startResize = useCallback(
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
				layout: effectiveLayout,
			};
			setIsResizing(true);
		},
		[effectiveLayout],
	);

	useEffect(() => {
		if (!isResizing) return;

		const handlePointerMove = (event: PointerEvent) => {
			const start = resizeStartRef.current;
			if (!start) return;
			if (start.layout === "cover") {
				const nextHeight = Math.max(
					MIN_HEIGHT,
					Math.min(MAX_HEIGHT, start.startHeight + (event.clientY - start.startY)),
				);
				updateAttributes({ displayHeight: Math.round(nextHeight) });
				return;
			}
			const nextWidth = Math.max(
				MIN_WIDTH,
				Math.min(MAX_WIDTH, start.startWidth + (event.clientX - start.startX)),
			);
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

	const containerClassName = useMemo(() => {
		if (effectiveLayout === "full") return "w-full";
		if (effectiveLayout === "cover") return "w-full";
		return "mx-auto";
	}, [effectiveLayout]);

	const containerStyle = useMemo(() => {
		if (effectiveLayout === "center") {
			return {
				width: displayWidth ? `${displayWidth}px` : undefined,
				maxWidth: "100%",
			};
		}
		if (effectiveLayout === "cover") {
			return {
				height: displayHeight ? `${displayHeight}px` : "320px",
			};
		}
		return undefined;
	}, [displayHeight, displayWidth, effectiveLayout]);

	const imageClassName =
		effectiveLayout === "cover"
			? "h-full w-full object-cover"
			: "w-full object-contain";

	const figureGridClassName =
		sources.length > 1 ? "grid gap-3 sm:grid-cols-2" : "";

	return (
		<NodeViewWrapper as="figure" className="my-3" contentEditable={false}>
			{sources.length > 0 ? (
				<div
					ref={containerRef}
					className={`relative ${containerClassName}`}
					style={containerStyle}
				>
					<div className={figureGridClassName}>
						{sources.map((item, index) => (
							<img
								key={`${item.src}-${index}`}
								src={item.src}
								alt={item.alt ?? name ?? "image"}
								loading="lazy"
								className={`rounded-lg border border-base-300 ${imageClassName}`}
								style={
									item.width && item.height && effectiveLayout !== "cover"
										? { aspectRatio: `${item.width} / ${item.height}` }
										: undefined
								}
							/>
						))}
					</div>
					<button
						className="btn btn-circle btn-xs absolute right-2 top-2 border border-base-300 bg-base-100/85"
						onClick={(event) => {
							event.preventDefault();
							setMenuPosition({ x: event.clientX, y: event.clientY });
							setMenuOpen(true);
						}}
						type="button"
					>
						<MoreHorizontal className="size-3.5" />
					</button>
					{effectiveLayout !== "full" ? (
						<button
							type="button"
							className="absolute bottom-2 right-2 h-4 w-4 cursor-se-resize rounded-sm border border-base-300 bg-base-100/80"
							onPointerDown={startResize}
						/>
					) : null}
					<ContextMenu
						open={menuOpen}
						position={menuPosition}
						items={menuItems}
						onClose={closeMenu}
					/>
				</div>
			) : error ? (
				<div className="flex items-center justify-between gap-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm">
					<div>
						<div className="font-medium">Image upload failed</div>
						<div className="text-base-content/70 text-xs">{error}</div>
					</div>
					<button className="btn btn-ghost btn-xs" onClick={() => deleteNode()} type="button">
						Remove
					</button>
				</div>
			) : (
				<div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content/60">
					Uploading image...
				</div>
			)}
		</NodeViewWrapper>
	);
}
