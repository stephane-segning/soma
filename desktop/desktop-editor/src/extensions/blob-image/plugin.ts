import { createId } from "@paralleldrive/cuid2";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { extractImageFiles } from "./events";
import { uploadAndHydrate } from "./hydrate";
import type { BlobImageUploadResult } from "./types";

export function createBlobImagePlugin(
	editor: Editor,
	upload: (file: File) => Promise<BlobImageUploadResult>,
	nodeTypeName: string,
) {
	const insertUploadingNode = (at: number | null, file: File): string => {
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
		if (at == null) editor.chain().focus().insertContent(content).run();
		else editor.chain().focus().insertContentAt(at, content).run();
		return uploadId;
	};

	const startUpload = (at: number | null, file: File) => {
		const uploadId = insertUploadingNode(at, file);
		void uploadAndHydrate({ editor, file, nodeTypeName, upload, uploadId });
	};

	return new Plugin({
		key: new PluginKey("soma-blob-image"),
		props: {
			handlePaste(_view, event) {
				const files = extractImageFiles(event);
				if (files.length === 0) return false;
				event.preventDefault();
				for (const file of files) startUpload(null, file);
				return true;
			},
			handleDrop(view, event) {
				const files = extractImageFiles(event);
				if (files.length === 0) return false;
				event.preventDefault();
				const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
				for (const file of files) startUpload(coords?.pos ?? null, file);
				return true;
			},
		},
	});
}
