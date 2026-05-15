import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import Code from "@tiptap/extension-code";
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
import { CharacterCount } from "@tiptap/extensions";
import type { createLowlight } from "lowlight";
import { AccordionNode } from "../../extensions/accordion";
import { BlobFileNode, type BlobFileUploadResult } from "../../extensions/blob-file";
import { BlobImageNode, type BlobImageUploadResult } from "../../extensions/blob-image";
import { CarouselNode } from "../../extensions/carousel";
import { CodeBlockExtensionFn } from "../../extensions/code-block";
import { CommanderExtension, type EditorCommand } from "../../extensions/commander";
import { createLinkMentionExtension, type MentionProvider } from "../../extensions/link-mention";
import { PageLinkNode } from "../../extensions/page-link";
import { TextRotateNode } from "../../extensions/text-rotate";

type CreateDocumentExtensionsInput = {
	commands: EditorCommand[];
	limit?: number;
	lowlight: ReturnType<typeof createLowlight>;
	mentionProviders?: MentionProvider[];
	onOpenPageLink?: (pageId: string, title?: string, href?: string) => void;
	onRenamePageLink?: (pageId: string, nextTitle: string, currentTitle?: string) => string | null | Promise<string | null>;
	placeholder: string;
	uploadFile?: (file: File) => Promise<BlobFileUploadResult>;
	uploadImage?: (file: File) => Promise<BlobImageUploadResult>;
};

export function createDocumentExtensions(input: CreateDocumentExtensionsInput) {
	const CustomDocument = Document.extend({ content: "heading block*" });
	const DraggableCodeBlock = CodeBlockExtensionFn(input.lowlight).extend({ draggable: true });
	const base = [
		CustomDocument,
		Text,
		CharacterCount.configure({ limit: input.limit }),
		Paragraph.extend({ draggable: true }),
		Heading.extend({ draggable: true }).configure({ levels: [1, 2, 3] }),
		Blockquote.extend({ draggable: true }),
		BulletList.extend({ draggable: true }),
		OrderedList.extend({ draggable: true }),
		ListItem,
		TaskList.extend({ draggable: true }),
		TaskItem.extend({ draggable: true }).configure({ nested: true }),
		DraggableCodeBlock,
		HorizontalRule.extend({ draggable: true }),
		PageLinkNode.configure({ onOpen: input.onOpenPageLink, onRename: input.onRenamePageLink }),
		TextRotateNode,
		CarouselNode,
		AccordionNode,
		Bold,
		Italic,
		Underline,
		Strike,
		Code,
		Link.configure({
			autolink: true,
			openOnClick: true,
			linkOnPaste: true,
			HTMLAttributes: { rel: "noreferrer", target: "_blank" },
		}),
		Dropcursor.configure({ color: "#3b82f6", width: 2 }),
		Placeholder.configure({ placeholder: input.placeholder }),
		CommanderExtension.configure({ commands: input.commands }),
	];

	if (input.mentionProviders?.length) {
		base.push(...input.mentionProviders.map((provider) => createLinkMentionExtension(provider)));
	}
	if (input.uploadImage) base.splice(base.length - 1, 0, BlobImageNode.configure({ upload: input.uploadImage }));
	if (input.uploadFile) base.splice(base.length - 1, 0, BlobFileNode.configure({ upload: input.uploadFile }));
	return base;
}
