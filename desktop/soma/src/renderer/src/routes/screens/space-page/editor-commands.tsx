import { defaultCommands, type EditorCommand } from "@soma/editor";
import { useMemo } from "react";
import { File as FileIcon, Image as ImageIcon, Link2, Paperclip } from "react-feather";
import * as documentsService from "../../../services/documents-service";
import { UNTITLED_PAGE_TITLE } from "../page-title";
import type { EditorLike } from "./types";
import type { BlobFileAttrs, BlobImageAttrs } from "./uploads";
import { pickFiles } from "./uploads";

type UsePageEditorCommandsInput = {
	spaceId: string;
	pageId: string;
	onOpenPagePicker: (editor: EditorLike, range: { from: number; to: number }) => void;
	uploadFile: (file: File) => Promise<BlobFileAttrs>;
	uploadImage: (file: File) => Promise<BlobImageAttrs>;
};

export function usePageEditorCommands({
	spaceId,
	pageId,
	onOpenPagePicker,
	uploadFile,
	uploadImage,
}: UsePageEditorCommandsInput): EditorCommand[] {
	return useMemo<EditorCommand[]>(() => {
		return [
			...defaultCommands,
			{
				key: "new-sub-page",
				name: "New sub-page",
				description: "Create a nested page and insert a link",
				keywords: ["page", "subpage", "nested"],
				section: "action",
				icon: <FileIcon className="size-3.5" />,
				handler: async ({ editor, range }) => {
					const created = await documentsService.ensurePage({
						spaceId,
						title: UNTITLED_PAGE_TITLE,
						parentPageIds: [pageId],
					});

					editor
						.chain()
						.focus()
						.deleteRange(range)
						.insertContent({
							type: "pageLink",
							attrs: {
								pageId: created.pageId,
								title: created.title || UNTITLED_PAGE_TITLE,
								href: `/spaces/${spaceId}/pages/${created.pageId}`,
							},
						})
						.run();
				},
			},
			{
				key: "insert-image",
				name: "Image",
				description: "Insert an image from disk",
				keywords: ["image", "photo", "picture"],
				section: "embed",
				icon: <ImageIcon className="size-3.5" />,
				handler: async ({ editor, range }) => {
					const files = await pickFiles({ accept: "image/*", multiple: true });
					if (files.length === 0) return;

					editor.chain().focus().deleteRange(range).run();
					for (const file of files) {
						if (!file.type.startsWith("image/")) continue;
						const attrs = await uploadImage(file);
						editor.chain().focus().insertContent({ type: "blobImage", attrs }).run();
					}
				},
			},
			{
				key: "insert-file",
				name: "File",
				description: "Insert a file from disk",
				keywords: ["file", "attachment", "upload"],
				section: "embed",
				icon: <Paperclip className="size-3.5" />,
				handler: async ({ editor, range }) => {
					const files = await pickFiles({ multiple: true });
					if (files.length === 0) return;

					editor.chain().focus().deleteRange(range).run();
					for (const file of files) {
						const attrs = await uploadFile(file);
						editor.chain().focus().insertContent({ type: "blobFile", attrs }).run();
					}
				},
			},
			{
				key: "link-to-page",
				name: "Link to page",
				description: "Insert a link to an existing page",
				keywords: ["page", "link", "reference"],
				section: "action",
				icon: <Link2 className="size-3.5" />,
				handler: async ({ editor, range }) => {
					onOpenPagePicker(editor, { from: range.from, to: range.to });
				},
			},
		];
	}, [onOpenPagePicker, pageId, spaceId, uploadFile, uploadImage]);
}
