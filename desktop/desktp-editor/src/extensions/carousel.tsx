import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { CarouselView } from "../components/carousel-view";

export const CarouselNode = Node.create({
	name: "carousel",
	group: "block",
	atom: true,
	defining: true,
	draggable: true,

	addAttributes() {
		return {
			items: { default: [] },
			className: { default: null },
			itemClassName: { default: null },
		};
	},

	renderHTML({ HTMLAttributes }) {
		return ["carousel", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ReactNodeViewRenderer(CarouselView, { as: "carousel" });
	},

	parseHTML() {
		return [{ tag: "carousel" }];
	},
});
