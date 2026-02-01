import type { JSONContent } from "@tiptap/core";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import Document from "@tiptap/extension-document";
import Dropcursor from "@tiptap/extension-dropcursor";
import Heading from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Strike from "@tiptap/extension-strike";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo } from "react";

import { defaultCommands } from "../commands/default-commands";
import { BlobFileNode, type BlobFileUploadResult } from "../extensions/blob-file";
import { BlobImageNode, type BlobImageUploadResult } from "../extensions/blob-image";
import { CommanderExtension, type EditorCommand } from "../extensions/commander";
import { PageLinkNode } from "../extensions/page-link";
import { ActionMenu } from "../menus/action-menu";

export type DocumentEditorProps = {
	className?: string;
	placeholder?: string;
	initialContent?: JSONContent | null;
	commands?: EditorCommand[];
	uploadImage?: (file: File) => Promise<BlobImageUploadResult>;
	uploadFile?: (file: File) => Promise<BlobFileUploadResult>;
	onOpenPageLink?: (pageId: string, title?: string, href?: string) => void;
	onRenamePageLink?: (pageId: string, nextTitle: string, currentTitle?: string) => string | null | Promise<string | null>;
	onChange?: (doc: JSONContent) => void;
};

export function DocumentEditor({
	className,
	placeholder = "Start writing...",
	initialContent,
	commands,
	uploadImage,
	uploadFile,
	onOpenPageLink,
	onRenamePageLink,
	onChange,
}: DocumentEditorProps): React.JSX.Element {
	const effectiveCommands = commands ?? defaultCommands;

	const extensions = useMemo(() => {
		// We explicitly extend core block nodes to be draggable so the ActionMenu can move them.
		const DraggableParagraph = Paragraph.extend({ draggable: true });
		const DraggableHeading = Heading.extend({ draggable: true });
		const DraggableBlockquote = Blockquote.extend({ draggable: true });
		const DraggableCodeBlock = CodeBlock.extend({ draggable: true });
		const DraggableRule = HorizontalRule.extend({ draggable: true });

		const base = [
			Document,
			Text,
			DraggableParagraph,
			DraggableHeading.configure({ levels: [1, 2, 3] }),
			DraggableBlockquote,
			BulletList,
			OrderedList,
			ListItem,
			TaskList,
			TaskItem.configure({ nested: true }),
			DraggableCodeBlock,
			DraggableRule,
			PageLinkNode.configure({ onOpen: onOpenPageLink, onRename: onRenamePageLink }),

			Bold,
			Italic,
			Underline,
			Strike,
			Code,
			Link.configure({
				autolink: true,
				openOnClick: true,
				linkOnPaste: true,
			}),

			Dropcursor,
			Placeholder.configure({ placeholder }),

			CommanderExtension.configure({ commands: effectiveCommands }),
		];

		if (uploadImage) {
			base.splice(base.length - 1, 0, BlobImageNode.configure({ upload: uploadImage }));
		}

		if (uploadFile) {
			base.splice(base.length - 1, 0, BlobFileNode.configure({ upload: uploadFile }));
		}

		return base;
	}, [effectiveCommands, onOpenPageLink, onRenamePageLink, placeholder, uploadFile, uploadImage]);

	const editor = useEditor({
		extensions,
		content: initialContent ?? undefined,
		editorProps: {
			attributes: {
				class: [
					"min-h-[70vh] w-full",
					"focus:outline-none",
					"prose prose-sm max-w-none",
					"prose-p:leading-7",
				].join(" "),
			},
		},
		onUpdate: ({ editor }) => {
			onChange?.(editor.getJSON());
		},
	});

	return (
		<div className={className}>
			<div className="relative">
				<ActionMenu editor={editor} />
				<EditorContent editor={editor} />
			</div>
		</div>
	);
}
