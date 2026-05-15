export const paragraphBlock = { type: "paragraph" };
export const headingBlock = { type: "heading", attrs: { level: 2 } };
export const bulletListBlock = {
	type: "bulletList",
	content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
};
export const orderedListBlock = {
	type: "orderedList",
	content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
};
export const taskListBlock = {
	type: "taskList",
	content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }],
};
export const pageLinkBlock = {
	type: "pageLink",
	attrs: {
		pageId: "page_demo_789",
		title: "Linked page",
		href: "/spaces/demo/pages/page_demo_789",
	},
};
export const textRotateBlock = {
	type: "textRotate",
	attrs: { items: ["Design", "Ship", "Iterate"] },
};
export const carouselBlock = {
	type: "carousel",
	attrs: {
		items: [
			{ src: "https://placehold.co/600x320/png?text=Slide+1" },
			{ src: "https://placehold.co/600x320/png?text=Slide+2" },
			{ src: "https://placehold.co/600x320/png?text=Slide+3" },
		],
	},
};
export const accordionBlock = {
	type: "accordion",
	attrs: {
		collapseType: "arrow",
		items: [
			{ title: "Accordion Item 1", content: "Add accordion content here." },
			{ title: "Accordion Item 2", content: "Second item details." },
		],
	},
};
