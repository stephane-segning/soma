import type { JSONContent } from "@soma/editor";

const heading = (text: string): JSONContent => ({
	type: "heading",
	attrs: { level: 1 },
	content: [{ type: "text", text }],
});

const para = (text: string): JSONContent => ({
	type: "paragraph",
	content: text.length > 0 ? [{ type: "text", text }] : undefined,
});

const item = (text: string, children?: JSONContent[]): JSONContent => ({
	type: "listItem",
	content: [para(text), ...(children ?? [])],
});

const task = (text: string, checked: boolean): JSONContent => ({
	type: "taskItem",
	attrs: { checked },
	content: [para(text)],
});

export const listsContent: JSONContent = {
	type: "doc",
	content: [
		heading("Lists & nesting"),
		para(
			"Click into any list item, then try Tab to indent, Shift-Tab to outdent, Enter to add a sibling, and Enter on an empty item to exit the list.",
		),
		{
			type: "bulletList",
			content: [
				item("First-level bullet"),
				item("Indent me with Tab", [
					{
						type: "bulletList",
						content: [item("Second-level bullet"), item("Try Shift-Tab to outdent")],
					},
				]),
				item("Third sibling"),
			],
		},
		para("Numbered list — same Tab / Shift-Tab behavior."),
		{
			type: "orderedList",
			content: [item("Outline an idea"), item("Refine it"), item("Ship it")],
		},
		para("Tasks — checkbox at the front, Enter to add the next item."),
		{
			type: "taskList",
			content: [
				task("Audit the editor surfaces", true),
				task("Wire Cmd+K for link insertion", true),
				task("Verify list nesting in Storybook", false),
			],
		},
	],
};

export const formatBubbleContent: JSONContent = {
	type: "doc",
	content: [
		heading("Format bubble"),
		para(
			"Select any text below to summon the format bubble. Try Bold, Italic, Underline, Strikethrough, Code, Highlight, and the Link button. Cmd+K with text selected opens a link prompt.",
		),
		{
			type: "paragraph",
			content: [
				{ type: "text", text: "This sentence has " },
				{ type: "text", text: "bold", marks: [{ type: "bold" }] },
				{ type: "text", text: ", " },
				{ type: "text", text: "italic", marks: [{ type: "italic" }] },
				{ type: "text", text: ", " },
				{ type: "text", text: "inline code", marks: [{ type: "code" }] },
				{ type: "text", text: ", " },
				{ type: "text", text: "highlighted text", marks: [{ type: "highlight" }] },
				{ type: "text", text: ", and a " },
				{
					type: "text",
					text: "link",
					marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }],
				},
				{ type: "text", text: " — try editing it with Cmd+K." },
			],
		},
		para(
			"Select this whole paragraph, then hit Cmd+K. You should see a browser prompt asking for the URL. Submit a value to wrap the selection in a link; submit an empty value to clear an existing link.",
		),
	],
};

export const markdownShortcutsContent: JSONContent = {
	type: "doc",
	content: [
		heading("Markdown shortcuts"),
		para(
			"Place the caret on the empty line below and try each shortcut. They fire as soon as you type the trigger followed by space (or backtick fence).",
		),
		{
			type: "bulletList",
			content: [
				item("Type `# ` → Heading 1"),
				item("Type `## ` → Heading 2"),
				item("Type `### ` → Heading 3"),
				item("Type `> ` → Blockquote"),
				item("Type `- ` or `* ` → Bullet list"),
				item("Type `1. ` → Numbered list"),
				item("Type ``` (three backticks) → Code block"),
			],
		},
		para(""),
		para(""),
	],
};
