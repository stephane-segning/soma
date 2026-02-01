import type { EditorCommand } from "../extensions/commander";

export const defaultCommands: EditorCommand[] = [
	{
		key: "heading-1",
		name: "Heading 1",
		description: "Large section heading",
		keywords: ["h1", "title", "heading"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
		},
	},
	{
		key: "heading-2",
		name: "Heading 2",
		description: "Medium section heading",
		keywords: ["h2", "heading"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
		},
	},
	{
		key: "heading-3",
		name: "Heading 3",
		description: "Small section heading",
		keywords: ["h3", "heading"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
		},
	},
	{
		key: "bullet-list",
		name: "Bulleted list",
		description: "Toggle a bulleted list",
		keywords: ["list", "ul", "bullet"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBulletList().run();
		},
	},
	{
		key: "ordered-list",
		name: "Numbered list",
		description: "Toggle a numbered list",
		keywords: ["list", "ol", "number"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleOrderedList().run();
		},
	},
	{
		key: "todo-list",
		name: "Todo list",
		description: "Toggle a checkbox list",
		keywords: ["todo", "task", "checkbox"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleTaskList().run();
		},
	},
	{
		key: "blockquote",
		name: "Quote",
		description: "Toggle a blockquote",
		keywords: ["quote", "blockquote"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleBlockquote().run();
		},
	},
	{
		key: "divider",
		name: "Divider",
		description: "Insert a horizontal divider",
		keywords: ["divider", "hr", "rule"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).setHorizontalRule().run();
		},
	},
	{
		key: "code-block",
		name: "Code block",
		description: "Insert a block of code",
		keywords: ["code", "snippet"],
		handler: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
		},
	},
];
