import type { JSONContent } from "@soma/editor";

export const initialContent: JSONContent = {
	type: "doc",
	content: [
		{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Soma Editor" }] },
		{
			type: "paragraph",
			content: [{ type: "text", text: "Try the slash menu, add popover, drag handle, and link context menu." }],
		},
		{
			type: "paragraph",
			content: [
				{ type: "text", text: "Links are rendered with typography styling, e.g. " },
				{ type: "text", text: "daisyui.com", marks: [{ type: "link", attrs: { href: "https://daisyui.com", target: "_blank" } }] },
				{ type: "text", text: "." },
			],
		},
		{
			type: "paragraph",
			content: [
				{ type: "text", text: "Text rotate: " },
				{ type: "textRotate", attrs: { items: ["Design", "Build", "Ship"] } },
			],
		},
		{ type: "pageLink", attrs: { pageId: "page_demo_123", title: "Project Brief", href: "/spaces/demo/pages/page_demo_123" } },
		{ type: "pageLink", attrs: { title: "DaisyUI components", href: "https://daisyui.com/components/" } },
		{
			type: "carousel",
			attrs: {
				items: [
					{ src: "https://placehold.co/640x360/png?text=Slide+1" },
					{ src: "https://placehold.co/640x360/png?text=Slide+2" },
					{ src: "https://placehold.co/640x360/png?text=Slide+3" },
				],
			},
		},
		{
			type: "accordion",
			attrs: {
				collapseType: "plus",
				items: [
					{ title: "Accordion Item 1", content: "Add accordion content here." },
					{ title: "Accordion Item 2", content: "Second item details." },
				],
			},
		},
		{
			type: "blockquote",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "Blockquote, lists, and tasks are included in the default editor setup." }],
				},
			],
		},
		{
			type: "bulletList",
			content: [
				{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Bulleted list" }] }] },
				{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Typography + links" }] }] },
			],
		},
		{
			type: "codeBlock",
			attrs: { language: "typescript" },
			content: [{ type: "text", text: "type Space = { id: string; name: string };\n\nconst byId = (space: Space) => space.id;\n" }],
		},
		{ type: "paragraph", content: [{ type: "text", text: "Task list example:" }] },
		{
			type: "taskList",
			content: [
				{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Ships with default commands" }] }] },
				{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Add more custom blocks" }] }] },
			],
		},
	],
};
