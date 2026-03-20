import { createId } from "@paralleldrive/cuid2";
import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";

import { BlobFileView } from "../components/blob-file-view";

export type BlobFileUploadResult = {
	cid: string;
	href: string;
	mime: string;
	size: number;
	name?: string;
};

type BlobFileOptions = {
	upload: (file: File) => Promise<BlobFileUploadResult>;
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

function extractNonImageFiles(event: ClipboardEvent | DragEvent): File[] {
	const dataTransfer = "clipboardData" in event ? event.clipboardData : event.dataTransfer;
	if (!dataTransfer?.files || dataTransfer.files.length === 0) return [];
	return Array.from(dataTransfer.files).filter((f) => !f.type.startsWith("image/"));
}

export const BlobFileNode = Node.create<BlobFileOptions>({
	name: "blobFile",
	group: "block",
	atom: true,
	defining: true,
	draggable: true,

	addOptions() {
		return {
			upload: async () => {
				throw new Error("BlobFileNode: missing `upload` option");
			},
		};
	},

	addAttributes() {
		return {
			uploadId: { default: null },
			cid: { default: null },
			href: { default: null },
			mime: { default: null },
			size: { default: null },
			name: { default: null },
		};
	},

	renderHTML({ HTMLAttributes }) {
		return ["blob-file", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ReactNodeViewRenderer(BlobFileView, { as: "blob-file" });
	},

	addProseMirrorPlugins() {
		const editor = this.editor;
		const upload = this.options.upload;
		const nodeTypeName = this.name;

		async function uploadAndHydrate(uploadId: string, file: File) {
			const result = await upload(file);

			const tr = editor.state.tr;
			let mutated = false;

			editor.state.doc.descendants((node, pos) => {
				if (node.type.name !== nodeTypeName) return;
				if (node.attrs.uploadId !== uploadId) return;

				mutated = true;
				tr.setNodeMarkup(pos, undefined, {
					...node.attrs,
					uploadId: null,
					cid: result.cid,
					href: result.href,
					mime: result.mime,
					size: result.size,
					name: result.name ?? file.name,
				});
			});

			if (mutated) dispatchIfMounted(editor, tr);
		}

		function insertUploadingNode(at: number | null, file: File): string {
			const uploadId = createId();

			const content = {
				type: nodeTypeName,
				attrs: {
					uploadId,
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
				key: new PluginKey("soma-blob-file"),
				props: {
					handlePaste(_view, event) {
						void _view;
						const files = extractNonImageFiles(event);
						if (files.length === 0) return false;

						event.preventDefault();
						for (const file of files) {
							const uploadId = insertUploadingNode(null, file);
							void uploadAndHydrate(uploadId, file);
						}
						return true;
					},

					handleDrop(view, event) {
						const files = extractNonImageFiles(event);
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
