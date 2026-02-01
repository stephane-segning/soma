import { createId } from "@paralleldrive/cuid2";
import {
	type BlobFileUploadResult,
	type BlobImageUploadResult,
	DocumentEditor,
	defaultCommands,
	type EditorCommand,
	type JSONContent,
} from "@soma/editor";
import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useMemo } from "react";

function pickFile(accept: string): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		let settled = false;
		const cleanup = () => {
			if (settled) return;
			settled = true;
			window.removeEventListener("focus", onFocus, true);
			input.remove();
		};
		const onFocus = () => {
			setTimeout(() => {
				if (settled) return;
				resolve(input.files?.[0] ?? null);
				cleanup();
			}, 0);
		};
		input.type = "file";
		input.accept = accept;
		input.onchange = () => {
			const file = input.files?.[0] ?? null;
			resolve(file);
			cleanup();
		};
		window.addEventListener("focus", onFocus, true);
		input.click();
	});
}

function loadImageDimensions(
	src: string,
): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () =>
			resolve({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => resolve(null);
		image.src = src;
	});
}

const meta: Meta<typeof DocumentEditor> = {
	title: "Editor/DocumentEditor",
	component: DocumentEditor,
	parameters: {
		layout: "fullscreen",
	},
};

export default meta;
type Story = StoryObj<typeof DocumentEditor>;

const initialContent: JSONContent = {
	type: "doc",
	content: [
		{
			type: "heading",
			attrs: { level: 1 },
			content: [{ type: "text", text: "Soma Editor" }],
		},
		{
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "Try the slash menu, drag handle, and page link context menu.",
				},
			],
		},
		{
			type: "pageLink",
			attrs: {
				pageId: "page_demo_123",
				title: "Project Brief",
				href: "/spaces/demo/pages/page_demo_123",
			},
		},
		{
			type: "codeBlock",
			attrs: { language: "typescript" },
			content: [
				{
					type: "text",
					text: "type Space = { id: string; name: string };\n\nconst byId = (space: Space) => space.id;\n",
				},
			],
		},
		{
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "Miaou",
				},
			],
		},
	],
};

export const Playground: Story = {
	render: () => {
		const uploadImage = useCallback(
			async (file: File): Promise<BlobImageUploadResult> => {
				const src = URL.createObjectURL(file);
				const dimensions = await loadImageDimensions(src);
				return {
					cid: createId(),
					src,
					mime: file.type || "application/octet-stream",
					size: file.size,
					name: file.name,
					width: dimensions?.width,
					height: dimensions?.height,
				};
			},
			[],
		);

		const uploadFile = useCallback(
			async (file: File): Promise<BlobFileUploadResult> => {
				return {
					cid: createId(),
					href: URL.createObjectURL(file),
					mime: file.type || "application/octet-stream",
					size: file.size,
					name: file.name,
				};
			},
			[],
		);

		const commands = useMemo<EditorCommand[]>(
			() => [
				...defaultCommands,
				{
					key: "insert-image",
					name: "Image",
					description: "Insert an image from disk",
					keywords: ["image", "photo", "media"],
					handler: async ({ editor, range }) => {
						const file = await pickFile("image/*");
						if (!file) return;
						const result = await uploadImage(file);
						editor
							.chain()
							.focus()
							.deleteRange(range)
							.insertContent({
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
							})
							.run();
					},
				},
				{
					key: "insert-file",
					name: "File",
					description: "Insert a file attachment",
					keywords: ["file", "attachment", "pdf"],
					handler: async ({ editor, range }) => {
						const file = await pickFile("*/*");
						if (!file) return;
						const result = await uploadFile(file);
						editor
							.chain()
							.focus()
							.deleteRange(range)
							.insertContent({
								type: "blobFile",
								attrs: {
									cid: result.cid,
									href: result.href,
									mime: result.mime,
									size: result.size,
									name: result.name,
								},
							})
							.run();
					},
				},
				{
					key: "insert-page-link",
					name: "Insert page link",
					description: "Insert a demo page link block",
					handler: ({ editor, range }) => {
						editor
							.chain()
							.focus()
							.deleteRange(range)
							.insertContent({
								type: "pageLink",
								attrs: {
									pageId: "page_demo_456",
									title: "Design Notes",
									href: "/spaces/demo/pages/page_demo_456",
								},
							})
							.run();
					},
				},
			],
			[uploadFile, uploadImage],
		);

		return (
			<div className="min-h-screen bg-base-100 px-32 py-12">
				<DocumentEditor
					commands={commands}
					initialContent={initialContent}
					onChange={() => {}}
					onOpenPageLink={(pageId) => {
						// eslint-disable-next-line no-alert
						alert(`Open page ${pageId} in new tab`);
					}}
					onRenamePageLink={async (_pageId, nextTitle) => nextTitle}
					placeholder="Start writing..."
					uploadFile={uploadFile}
					uploadImage={uploadImage}
				/>
			</div>
		);
	},
};
