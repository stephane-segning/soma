import { defaultCommands, type BlobFileUploadResult, type BlobImageUploadResult, type EditorCommand } from "@soma/editor";
import { pickFile } from "./file-utils";

type CommandArgs = Parameters<EditorCommand["handler"]>[0];

export function createStoryCommands(input: {
	uploadFile: (file: File) => Promise<BlobFileUploadResult>;
	uploadImage: (file: File) => Promise<BlobImageUploadResult>;
}): EditorCommand[] {
	return [
		...defaultCommands,
		{
			key: "insert-image",
			name: "Image",
			description: "Insert an image from disk",
			keywords: ["image", "photo", "media"],
			section: "embed",
			handler: async ({ editor, range }) => {
				const file = await pickFile("image/*");
				if (!file) return;
				const result = await input.uploadImage(file);
				editor.chain().focus().deleteRange(range).insertContent({
					type: "blobImage",
					attrs: {
						cid: result.cid,
						src: result.src,
						mime: result.mime,
						size: result.size,
						name: result.name,
						width: result.width ?? null,
						height: result.height ?? null,
					},
				}).run();
			},
		},
		{
			key: "insert-file",
			name: "File",
			description: "Insert a file attachment",
			keywords: ["file", "attachment", "pdf"],
			section: "embed",
			handler: async ({ editor, range }) => {
				const file = await pickFile("*/*");
				if (!file) return;
				const result = await input.uploadFile(file);
				editor.chain().focus().deleteRange(range).insertContent({
					type: "blobFile",
					attrs: { cid: result.cid, href: result.href, mime: result.mime, size: result.size, name: result.name },
				}).run();
			},
		},
		{
			key: "insert-page-link",
			name: "Insert page link",
			description: "Insert a demo page link block",
			section: "embed",
			handler: ({ editor, range }) => insertAtRange(editor, range, { type: "pageLink", attrs: { pageId: "page_demo_456", title: "Design Notes", href: "/spaces/demo/pages/page_demo_456" } }),
		},
		{
			key: "insert-text-rotate",
			name: "Text rotate",
			description: "Insert a rotating text component",
			section: "advanced",
			handler: ({ editor, range }) => insertAtRange(editor, range, {
				type: "paragraph",
				content: [{ type: "text", text: "Rotating words: " }, { type: "textRotate", attrs: { items: ["Design", "Build", "Ship"] } }],
			}),
		},
		{
			key: "insert-carousel",
			name: "Carousel",
			description: "Insert a carousel block",
			section: "embed",
			handler: ({ editor, range }) => insertAtRange(editor, range, {
				type: "carousel",
				attrs: { items: [{ src: "https://placehold.co/640x360/png?text=Slide+1" }, { src: "https://placehold.co/640x360/png?text=Slide+2" }, { src: "https://placehold.co/640x360/png?text=Slide+3" }] },
			}),
		},
		{
			key: "insert-accordion",
			name: "Accordion",
			description: "Insert an accordion block",
			section: "advanced",
			handler: ({ editor, range }) => insertAtRange(editor, range, {
				type: "accordion",
				attrs: { collapseType: "arrow", items: [{ title: "Accordion Item 1", content: "Add accordion content here." }, { title: "Accordion Item 2", content: "Second item details." }] },
			}),
		},
	];
}

function insertAtRange(editor: CommandArgs["editor"], range: CommandArgs["range"], content: Record<string, unknown>) {
	editor.chain().focus().deleteRange(range).insertContent(content).run();
}
