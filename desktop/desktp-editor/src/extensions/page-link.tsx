import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { PageLinkView } from "../components/page-link-view";

type PageLinkOptions = {
	onOpen?: (pageId: string, title?: string, href?: string) => void;
	onRename?: (
		pageId: string,
		nextTitle: string,
		currentTitle?: string,
	) => string | null | Promise<string | null>;
};

export const PageLinkNode = Node.create<PageLinkOptions>({
	atom: true,
	defining: true,
	draggable: true,
	group: "block",
	name: "pageLink",

	addAttributes: () => ({
		pageId: { default: null },
		title: { default: null },
		href: { default: null },
	}),
	addNodeView: () => ReactNodeViewRenderer(PageLinkView, { as: "page-link" }),
	addOptions: () => ({
		onOpen: undefined,
		onRename: undefined,
	}),
	renderHTML: ({ HTMLAttributes }) => [
		"page-link",
		mergeAttributes(HTMLAttributes),
	],
	parseHTML: () => [
		{
			tag: "page-link",
		},
	],
});
