import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { AccordionView } from "../components/accordion-view";

export const AccordionNode = Node.create({
	name: "accordion",
	group: "block",
	atom: true,
	defining: true,
	draggable: true,

	addAttributes() {
		return {
			items: { default: [] },
			className: { default: null },
			itemClassName: { default: null },
			collapseType: { default: "arrow" },
		};
	},

	renderHTML({ HTMLAttributes }) {
		return ["accordion", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ReactNodeViewRenderer(AccordionView, { as: "accordion" });
	},

	parseHTML() {
		return [{ tag: "accordion" }];
	},
});
