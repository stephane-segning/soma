import { createId } from "@paralleldrive/cuid2";
import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";

import { BlobImageView } from "../components/blob-image-view";

export type BlobImageUploadResult = {
	cid: string;
	src: string;
	mime: string;
	size: number;
	name?: string;
	width?: number;
	height?: number;
	variants?: {
		cid: string;
		url: string;
		mime: string;
		size: number;
		name: string;
		width?: number;
		height?: number;
	}[];
};

type BlobImageOptions = {
	upload: (file: File) => Promise<BlobImageUploadResult>;
};

function dispatchIfMounted(editor: Editor, tr: Transaction): void {
	const element = editor.options.element;
	if (!(element instanceof HTMLElement)) return;
	if (editor.isDestroyed) return;
	try {
		editor.view.dispatch(tr);
	} catch {
		// Ignore uploads completing after unmount.
	}
}

function extractImageFiles(event: ClipboardEvent | DragEvent): File[] {
	const dataTransfer = "clipboardData" in event ? event.clipboardData : event.dataTransfer;
	if (!dataTransfer?.files || dataTransfer.files.length === 0) return [];
	return Array.from(dataTransfer.files).filter((f) => f.type.startsWith("image/"));
}

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
		const editor = this.editor;
		const upload = this.options.upload;
		const nodeTypeName = this.name;

		async function uploadAndHydrate(uploadId: string, file: File) {
			try {
				const result = await upload(file);

				let found = false;
				const tr = editor.state.tr;
				editor.state.doc.descendants((node, pos) => {
					if (node.type.name !== nodeTypeName) return;
					if (node.attrs.uploadId !== uploadId) return;

					found = true;
					const sources =
						result.variants && result.variants.length > 0
							? [
									{
										src: result.src,
										alt: result.name ?? file.name,
										width: result.width ?? null,
										height: result.height ?? null,
									},
									...result.variants.map((variant) => ({
										src: variant.url,
										alt: variant.name,
										width: variant.width ?? null,
										height: variant.height ?? null,
									})),
								]
							: null;
					tr.setNodeMarkup(pos, undefined, {
						...node.attrs,
						uploadId: null,
						error: null,
						cid: result.cid,
						src: result.src,
						sources,
						mime: result.mime,
						size: result.size,
						name: result.name ?? file.name,
						width: result.width ?? null,
						height: result.height ?? null,
					});
					return false;
				});

				if (found) dispatchIfMounted(editor, tr);
			} catch (error) {
				let found = false;
				const tr = editor.state.tr;
				editor.state.doc.descendants((node, pos) => {
					if (node.type.name !== nodeTypeName) return;
					if (node.attrs.uploadId !== uploadId) return;
					found = true;
					tr.setNodeMarkup(pos, undefined, {
						...node.attrs,
						uploadId: null,
						error: error instanceof Error ? error.message : String(error),
					});
					return false;
				});
				if (found) dispatchIfMounted(editor, tr);
			}
		}

		function insertUploadingNode(at: number | null, file: File): string {
			const uploadId = createId();

			const content = {
				type: nodeTypeName,
				attrs: {
					uploadId,
					error: null,
					name: file.name,
					mime: file.type || "application/octet-stream",
					size: file.size,
				},
			};

			if (at == null) {
				editor.chain().focus().insertContent(content).run();
			} else {
				editor.chain().focus().insertContentAt(at, content).run();
			}

			return uploadId;
		}

		return [
			new Plugin({
				key: new PluginKey("soma-blob-image"),
				props: {
					handlePaste(_view, event) {
						void _view;
						const files = extractImageFiles(event);
						if (files.length === 0) return false;

						event.preventDefault();
						for (const file of files) {
							const uploadId = insertUploadingNode(null, file);
							void uploadAndHydrate(uploadId, file);
						}
						return true;
					},

					handleDrop(view, event) {
						const files = extractImageFiles(event);
						if (files.length === 0) return false;

						event.preventDefault();
						const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
						const at = coords?.pos ?? null;

						for (const file of files) {
							const uploadId = insertUploadingNode(at, file);
							void uploadAndHydrate(uploadId, file);
						}
						return true;
					},
				},
			}),
		];
	},
});
