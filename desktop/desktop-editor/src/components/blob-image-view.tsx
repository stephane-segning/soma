import { ContextMenu } from "@soma/ui/components/overlays/context-menu";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "react-feather";
import { EmptyImageState } from "./blob-image-view/empty-state";
import { ImageGrid } from "./blob-image-view/image-grid";
import { createImageMenuItems } from "./blob-image-view/menu";
import { useImageResize } from "./blob-image-view/resize";
import { resolveImageLayout, resolveImageSources } from "./blob-image-view/state";

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
	const sources = useMemo(
		() => resolveImageSources({ raw: node.attrs.sources, src, name, width, height }),
		[height, name, node.attrs.sources, src, width],
	);
	const layout = resolveImageLayout({
		displayHeight,
		displayWidth,
		layoutAttr: node.attrs.layout,
		sourceCount: sources.length,
	});
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement | null>(null);
	const startResize = useImageResize({ containerRef, layout, updateAttributes });
	const menuItems = useMemo(
		() =>
			createImageMenuItems({
				displayHeight,
				displayWidth,
				updateAttributes,
				width,
			}),
		[displayHeight, displayWidth, updateAttributes, width],
	);

	return (
		<NodeViewWrapper as="figure" className="my-3" contentEditable={false}>
			{sources.length > 0 ? (
				<div ref={containerRef} className={`relative ${layout.containerClassName}`} style={layout.containerStyle}>
					<ImageGrid effectiveLayout={layout.effectiveLayout} name={name} sources={sources} />
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
					{layout.effectiveLayout !== "full" ? (
						<button
							type="button"
							className="absolute bottom-2 right-2 h-4 w-4 cursor-se-resize rounded-sm border border-base-300 bg-base-100/80"
							onPointerDown={startResize}
						/>
					) : null}
					<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} onClose={() => setMenuOpen(false)} />
				</div>
			) : (
				<EmptyImageState error={error} onDelete={deleteNode} />
			)}
		</NodeViewWrapper>
	);
}
