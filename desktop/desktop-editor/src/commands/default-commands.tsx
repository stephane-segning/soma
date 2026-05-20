import { CheckSquare, Code, Hash, List, MessageSquare, Minus } from "react-feather";
import type { EditorCommand } from "../extensions/commander";

// react-feather doesn't ship an ordered-list icon — use a numeric glyph
// in the same footprint so the row aligns with the others.
function OrderedListIcon() {
	return (
		<span
			aria-hidden
			className="inline-flex size-3.5 items-center justify-center font-mono text-xs"
		>
			1.
		</span>
	);
}

export const defaultCommands: EditorCommand[] = [
	{
		key: "heading-1",
		name: "Heading 1",
		description: "Large section heading",
		keywords: ["h1", "title", "heading"],
		section: "text",
		icon: <Hash className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
		},
	},
	{
		key: "heading-2",
		name: "Heading 2",
		description: "Medium section heading",
		keywords: ["h2", "heading"],
		section: "text",
		icon: <Hash className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
		},
	},
	{
		key: "heading-3",
		name: "Heading 3",
		description: "Small section heading",
		keywords: ["h3", "heading"],
		section: "text",
		icon: <Hash className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
		},
	},
	{
		key: "blockquote",
		name: "Quote",
		description: "Toggle a blockquote",
		keywords: ["quote", "blockquote"],
		section: "text",
		icon: <MessageSquare className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBlockquote().run();
		},
	},
	{
		key: "code-block",
		name: "Code block",
		description: "Insert a block of code",
		keywords: ["code", "snippet"],
		section: "text",
		icon: <Code className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
		},
	},
	{
		key: "bullet-list",
		name: "Bulleted list",
		description: "Toggle a bulleted list",
		keywords: ["list", "ul", "bullet"],
		section: "list",
		icon: <List className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBulletList().run();
		},
	},
	{
		key: "ordered-list",
		name: "Numbered list",
		description: "Toggle a numbered list",
		keywords: ["list", "ol", "number"],
		section: "list",
		icon: <OrderedListIcon />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleOrderedList().run();
		},
	},
	{
		key: "todo-list",
		name: "Todo list",
		description: "Toggle a checkbox list",
		keywords: ["todo", "task", "checkbox"],
		section: "list",
		icon: <CheckSquare className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleTaskList().run();
		},
	},
	{
		key: "divider",
		name: "Divider",
		description: "Insert a horizontal divider",
		keywords: ["divider", "hr", "rule"],
		section: "advanced",
		icon: <Minus className="size-3.5" />,
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHorizontalRule().run();
		},
	},
];
