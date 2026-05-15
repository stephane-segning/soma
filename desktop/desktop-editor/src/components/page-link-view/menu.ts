import type { ContextMenuItem } from "@soma/ui/components/overlays/context-menu";

type CreatePageLinkMenuItemsInput = {
	href?: string;
	onOpen: () => void;
	onOpenPage?: (pageId: string, title?: string, href?: string) => void;
	onRenamePage?: (pageId: string, nextTitle: string, currentTitle?: string) => string | null | Promise<string | null>;
	onRename: () => void;
	pageId?: string;
};

export function createPageLinkMenuItems({
	href,
	onOpen,
	onOpenPage,
	onRenamePage,
	onRename,
	pageId,
}: CreatePageLinkMenuItemsInput): ContextMenuItem[] {
	return [
		{
			id: "open",
			label: pageId ? "Open page" : "Open link",
			disabled: (!pageId || !onOpenPage) && !href,
			onSelect: onOpen,
		},
		{
			id: "copy",
			label: "Copy link",
			disabled: !href && !pageId,
			onSelect: () => {
				void copyLink(href ?? pageId);
			},
		},
		{
			id: "rename",
			label: "Rename",
			disabled: pageId ? !onRenamePage : false,
			onSelect: onRename,
		},
	];
}

async function copyLink(link?: string): Promise<void> {
	if (!link) return;
	try {
		await navigator.clipboard.writeText(link);
	} catch {
		// ignore clipboard failures
	}
}
