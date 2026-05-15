import { ContextMenu } from "@soma/ui/components/overlays/context-menu";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Link2 } from "react-feather";
import { RenameInlineEditor } from "./page-link-view/rename-inline-editor";
import { createPageLinkMenuItems } from "./page-link-view/menu";
import { formatLinkLabel, getPageLinkOptions } from "./page-link-view/utils";

export function PageLinkView({
	node,
	extension,
	updateAttributes,
}: NodeViewProps): React.JSX.Element {
	const title = (node.attrs.title as string | undefined) ?? "Untitled link";
	const pageId = node.attrs.pageId as string | undefined;
	const href = node.attrs.href as string | undefined;
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
	const [isRenaming, setIsRenaming] = useState(false);
	const [draftTitle, setDraftTitle] = useState(title);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const { onOpenPage, onRenamePage } = getPageLinkOptions(extension.options);

	useEffect(() => {
		if (!isRenaming) return;
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [isRenaming]);

	const handleOpen = () => {
		if (pageId && onOpenPage) return onOpenPage(pageId, title, href);
		if (href) window.open(href, "_blank", "noreferrer");
	};
	const handleRename = async () => {
		const trimmed = draftTitle.trim();
		if (!trimmed || trimmed === title) return setIsRenaming(false);
		if (!pageId || !onRenamePage) {
			updateAttributes({ title: trimmed });
			return setIsRenaming(false);
		}
		const nextTitle = await onRenamePage(pageId, trimmed, title);
		if (nextTitle && nextTitle !== title) updateAttributes({ title: nextTitle });
		setIsRenaming(false);
	};
	const menuItems = useMemo(
		() =>
			createPageLinkMenuItems({
				href,
				onOpenPage,
				onRenamePage,
				onRename: () => {
					setDraftTitle(title);
					setIsRenaming(true);
				},
				onOpen: handleOpen,
				pageId,
			}),
		[href, onOpenPage, pageId, title],
	);
	const subtitle = pageId ? pageId : href ? formatLinkLabel(href) : null;

	return (
		<NodeViewWrapper as="div" className="page-link text-[1em]" contentEditable={false}>
			<button
				type="button"
				className="flex w-full cursor-pointer items-center gap-4 rounded-lg border border-primary bg-primary/10 px-3 py-2 my-2 text-left text-[0.95em]"
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuPosition({ x: event.clientX, y: event.clientY });
					setMenuOpen(true);
				}}
				onClick={handleOpen}
			>
				<Link2 className="size-[1.2em] text-primary" />
				<div className="flex-1">
					<div className="truncate font-medium">{title}</div>
					{subtitle ? <div className="text-[0.75em] text-base-content/60">{subtitle}</div> : null}
				</div>
				<ArrowRight className="size-[1.2em] text-primary" />
			</button>
			<RenameInlineEditor
				draftTitle={draftTitle}
				inputRef={inputRef}
				isRenaming={isRenaming}
				onCancel={() => {
					setIsRenaming(false);
					setDraftTitle(title);
				}}
				onChange={setDraftTitle}
				onRename={handleRename}
			/>
			<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} onClose={() => setMenuOpen(false)} />
		</NodeViewWrapper>
	);
}
