import type { Editor } from "@tiptap/react";
import type { BlobFileUploadResult } from "../../extensions/blob-file";
import type { BlobImageUploadResult } from "../../extensions/blob-image";

export async function insertImageFromPicker(
	editor: Editor | null,
	insertPos: number,
	uploadImage?: (file: File) => Promise<BlobImageUploadResult>,
) {
	if (!editor || !uploadImage) return;
	const files = await pickFiles({ accept: "image/*", multiple: true });
	for (const file of files) {
		if (!file.type.startsWith("image/")) continue;
		const uploaded = await uploadImage(file);
		editor.chain().focus().insertContentAt(insertPos, { type: "blobImage", attrs: uploaded }).run();
	}
}

export async function insertFileFromPicker(
	editor: Editor | null,
	insertPos: number,
	uploadFile?: (file: File) => Promise<BlobFileUploadResult>,
) {
	if (!editor || !uploadFile) return;
	const files = await pickFiles({ multiple: true });
	for (const file of files) {
		const uploaded = await uploadFile(file);
		editor.chain().focus().insertContentAt(insertPos, { type: "blobFile", attrs: uploaded }).run();
	}
}

function pickFiles(options: { accept?: string; multiple?: boolean }): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = options.accept ?? "";
		input.multiple = options.multiple ?? false;
		input.onchange = () => {
			const files = input.files ? Array.from(input.files) : [];
			input.remove();
			resolve(files);
		};
		input.click();
	});
}
