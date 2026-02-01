import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { PageLinkView } from "../components/page-link-view";

type PageLinkOptions = {
	onOpen?: (pageId: string, title?: string, href?: string) => void;
	onRename?: (pageId: string, currentTitle?: string) => string | null | Promise<string | null>;
};

export const PageLinkNode = Node.create<PageLinkOptions>({
	name: "pageLink",
	group: "block",
	atom: true,
	defining: true,
	draggable: true,

	addAttributes() {
		return {
			pageId: { default: null },
			title: { default: null },
			href: { default: null },
		};
	},

	addOptions() {
		return {
			onOpen: undefined,
			onRename: undefined,
		};
	},

	renderHTML({ HTMLAttributes }) {
		return ["page-link", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ReactNodeViewRenderer(PageLinkView, { as: "page-link" });
	},
});
