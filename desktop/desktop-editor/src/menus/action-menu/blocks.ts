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
