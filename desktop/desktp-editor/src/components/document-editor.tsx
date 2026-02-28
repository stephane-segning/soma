import { LimitPercentage } from "./limit-percentage";
import { useLowlight } from "../hooks/lowlight";
import {
	ContextualMenu,
	type QuickActionRequest,
	type QuickActionResponse,
} from "../menus/contextual-menu";
import type { JSONContent } from "@tiptap/core";
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
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo } from "react";
import { defaultCommands } from "../commands/default-commands";
import { AccordionNode } from "../extensions/accordion";
import {
	BlobFileNode,
	type BlobFileUploadResult,
} from "../extensions/blob-file";
import {
	BlobImageNode,
	type BlobImageUploadResult,
} from "../extensions/blob-image";
import { CarouselNode } from "../extensions/carousel";
import { CodeBlockExtensionFn } from "../extensions/code-block";
import {
	CommanderExtension,
	type EditorCommand,
} from "../extensions/commander";
import {
	createLinkMentionExtension,
	type MentionProvider,
} from "../extensions/link-mention";
import { PageLinkNode } from "../extensions/page-link";
import { TextRotateNode } from "../extensions/text-rotate";
import { ActionMenu } from "../menus/action-menu";

export type DocumentEditorProps = {
	className?: string;
	placeholder?: string;
	initialContent?: JSONContent | null;
	commands?: EditorCommand[];
	uploadImage?: (file: File) => Promise<BlobImageUploadResult>;
	uploadFile?: (file: File) => Promise<BlobFileUploadResult>;
	onOpenPageLink?: (pageId: string, title?: string, href?: string) => void;
	onRenamePageLink?: (
		pageId: string,
		nextTitle: string,
		currentTitle?: string,
	) => string | null | Promise<string | null>;
	mentionProviders?: MentionProvider[];
	onChange?: (doc: JSONContent) => void;
	limit?: number;
	onQuickAction?: (
		input: QuickActionRequest,
	) => Promise<QuickActionResponse>;
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
	mentionProviders,
	onChange,
	limit,
	onQuickAction,
}: DocumentEditorProps): React.JSX.Element {
	const effectiveCommands = commands ?? defaultCommands;
	const lowlight = useLowlight();

	const CustomDocument = useMemo(
		() =>
			Document.extend({
				content: "heading block*",
			}),
		[],
	);

	const extensions = useMemo(() => {
		// We explicitly extend core block nodes to be draggable so the ActionMenu can move them.
		const DraggableParagraph = Paragraph.extend({ draggable: true });
		const DraggableHeading = Heading.extend({ draggable: true });
		const DraggableBlockquote = Blockquote.extend({ draggable: true });
		const DraggableCodeBlock = CodeBlockExtensionFn(lowlight).extend({
			draggable: true,
		});
		const DraggableRule = HorizontalRule.extend({ draggable: true });
		const CountRule = CharacterCount.configure({
			limit,
		});

		const base = [
			CustomDocument,
			Text,
			CountRule,
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
			PageLinkNode.configure({
				onOpen: onOpenPageLink,
				onRename: onRenamePageLink,
			}),
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
				HTMLAttributes: {
					rel: "noreferrer",
					target: "_blank",
				},
			}),

			Dropcursor,
			Placeholder.configure({ placeholder }),

			CommanderExtension.configure({ commands: effectiveCommands }),
		];

		if (mentionProviders && mentionProviders.length > 0) {
			base.push(
				...mentionProviders.map((provider) =>
					createLinkMentionExtension(provider),
				),
			);
		}

		if (uploadImage) {
			base.splice(
				base.length - 1,
				0,
				BlobImageNode.configure({ upload: uploadImage }),
			);
		}

		if (uploadFile) {
			base.splice(
				base.length - 1,
				0,
				BlobFileNode.configure({ upload: uploadFile }),
			);
		}

		return base;
	}, [
		effectiveCommands,
		mentionProviders,
		onOpenPageLink,
		onRenamePageLink,
		placeholder,
		uploadFile,
		uploadImage,
		CustomDocument,
		limit,
		lowlight,
	]);

	const editor = useEditor({
		extensions,
		content: initialContent ?? undefined,
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class: [
					"min-h-[70vh] w-full",
					"focus:outline-none",
					"prose dark:prose-invert prose-slate md:prose-lg lg:prose-xl max-w-none",
					"prose-p:leading-7",
					"prose-img:rounded-xl prose-headings:text-secondary prose-a:text-blue-600 prose-a:underline prose-a:decoration-blue-300 prose-a:underline-offset-2",
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

				{editor && (
					<ContextualMenu editor={editor} onQuickAction={onQuickAction} />
				)}
				{editor && limit && <LimitPercentage editor={editor} limit={limit} />}
			</div>
		</div>
	);
}
