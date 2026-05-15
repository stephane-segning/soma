import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { BlobImageView } from "../components/blob-image-view";
import { createBlobImagePlugin } from "./blob-image/plugin";
import type { BlobImageOptions, BlobImageUploadResult } from "./blob-image/types";

export type { BlobImageUploadResult };

export const BlobImageNode = Node.create<BlobImageOptions>({
	name: "blobImage",
	group: "block",
	atom: true,
	defining: true,
	draggable: true,

	addOptions() {
		return {
			upload: async () => {
				throw new Error("BlobImageNode: missing `upload` option");
			},
		};
	},

	addAttributes() {
		return {
			uploadId: { default: null },
			error: { default: null },
			cid: { default: null },
			src: { default: null },
			sources: { default: null },
			mime: { default: null },
			size: { default: null },
			name: { default: null },
			width: { default: null },
			height: { default: null },
			displayWidth: { default: null },
			displayHeight: { default: null },
			layout: { default: "center" },
		};
	},

	renderHTML({ HTMLAttributes }) {
		return ["blob-image", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ReactNodeViewRenderer(BlobImageView, { as: "blob-image" });
	},

	addProseMirrorPlugins() {
		return [createBlobImagePlugin(this.editor, this.options.upload, this.name)];
	},
});
