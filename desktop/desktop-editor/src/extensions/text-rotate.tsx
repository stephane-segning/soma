import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { TextRotateView } from "../components/text-rotate-view";

export const TextRotateNode = Node.create({
	name: "textRotate",
	group: "inline",
	inline: true,
	atom: true,
	draggable: true,

	addAttributes() {
		return {
			items: { default: [] },
			className: { default: null },
		};
	},

	renderHTML({ HTMLAttributes }) {
		return ["text-rotate", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ReactNodeViewRenderer(TextRotateView, { as: "text-rotate" });
	},

	parseHTML() {
		return [{ tag: "text-rotate" }];
	},
});
