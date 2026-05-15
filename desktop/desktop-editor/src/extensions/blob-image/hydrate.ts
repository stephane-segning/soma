import type { Editor } from "@tiptap/core";
import { dispatchIfMounted } from "./dispatch";
import type { BlobImageUploadResult } from "./types";

export async function uploadAndHydrate(input: {
	editor: Editor;
	file: File;
	nodeTypeName: string;
	upload: (file: File) => Promise<BlobImageUploadResult>;
	uploadId: string;
}) {
	const { editor, file, nodeTypeName, upload, uploadId } = input;
	try {
		const result = await upload(file);
		updateUploadingNode(editor, nodeTypeName, uploadId, (node) => ({
			...node.attrs,
			uploadId: null,
			error: null,
			cid: result.cid,
			src: result.src,
			sources: buildSources(result, file),
			mime: result.mime,
			size: result.size,
			name: result.name ?? file.name,
			width: result.width ?? null,
			height: result.height ?? null,
		}));
	} catch (error) {
		updateUploadingNode(editor, nodeTypeName, uploadId, (node) => ({
			...node.attrs,
			uploadId: null,
			error: error instanceof Error ? error.message : String(error),
		}));
	}
}

function updateUploadingNode(editor: Editor, nodeTypeName: string, uploadId: string, attrsForNode: (node: { attrs: Record<string, unknown> }) => Record<string, unknown>) {
	let found = false;
	const tr = editor.state.tr;
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== nodeTypeName || node.attrs.uploadId !== uploadId) return;
		found = true;
		tr.setNodeMarkup(pos, undefined, attrsForNode(node));
		return false;
	});
	if (found) dispatchIfMounted(editor, tr);
}

function buildSources(result: BlobImageUploadResult, file: File) {
	if (!result.variants?.length) return null;
	return [
		{ src: result.src, alt: result.name ?? file.name, width: result.width ?? null, height: result.height ?? null },
		...result.variants.map((variant) => ({
			src: variant.url,
			alt: variant.name,
			width: variant.width ?? null,
			height: variant.height ?? null,
		})),
	];
}
