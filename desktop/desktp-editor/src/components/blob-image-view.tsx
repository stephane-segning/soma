import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";

export function BlobImageView({ node }: NodeViewProps): React.JSX.Element {
	const src = node.attrs.src as string | undefined;
	const name = node.attrs.name as string | undefined;
	const width = node.attrs.width as number | undefined;
	const height = node.attrs.height as number | undefined;

	return (
		<NodeViewWrapper as="div" className="my-3" contentEditable={false}>
			{src ? (
				<img
					src={src}
					alt={name ?? "image"}
					loading="lazy"
					className="max-w-full rounded-lg border border-base-300"
					style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
				/>
			) : (
				<div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content/60">
					Uploading image...
				</div>
			)}
		</NodeViewWrapper>
	);
}

