import {
	ContextMenu,
	type ContextMenuItem,
} from "@soma/ui/components/overlays/context-menu";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2 } from "react-feather";

export function PageLinkView({
	node,
	extension,
	updateAttributes,
}: NodeViewProps): React.JSX.Element {
	const title = (node.attrs.title as string | undefined) ?? "Untitled page";
	const pageId = node.attrs.pageId as string | undefined;
	const href = node.attrs.href as string | undefined;
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
	const [isRenaming, setIsRenaming] = useState(false);
	const [draftTitle, setDraftTitle] = useState(title);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const onOpenPage = useMemo(() => {
		return (
			extension.options as
				| {
						onOpen?: (pageId: string, title?: string, href?: string) => void;
				  }
				| undefined
		)?.onOpen;
	}, [extension.options]);

	const onRenamePage = useMemo(() => {
		return (
			extension.options as
				| {
						onRename?: (
							pageId: string,
							nextTitle: string,
							currentTitle?: string,
						) => string | null | Promise<string | null>;
				  }
				| undefined
		)?.onRename;
	}, [extension.options]);

	const closeMenu = useCallback(() => {
		setMenuOpen(false);
	}, []);

	useEffect(() => {
		if (!isRenaming) return;
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [isRenaming]);

	const handleOpen = useCallback(() => {
		if (!pageId || !onOpenPage) return;
		onOpenPage(pageId, title, href);
	}, [href, onOpenPage, pageId, title]);

	const handleCopy = useCallback(async () => {
		const link = href ?? pageId;
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
		} catch {
			// ignore clipboard failures
		}
	}, [href, pageId]);

	const handleRename = useCallback(async () => {
		if (!pageId || !onRenamePage) {
			setIsRenaming(false);
			return;
		}
		const trimmed = draftTitle.trim();
		if (!trimmed || trimmed === title) {
			setIsRenaming(false);
			return;
		}
		const nextTitle = await onRenamePage(pageId, trimmed, title);
		if (nextTitle && nextTitle !== title) {
			updateAttributes({ title: nextTitle });
		}
		setIsRenaming(false);
	}, [draftTitle, onRenamePage, pageId, title, updateAttributes]);

	const menuItems = useMemo<ContextMenuItem[]>(() => {
		return [
			{
				id: "open",
				label: "Open in new tab",
				disabled: !pageId || !onOpenPage,
				onSelect: handleOpen,
			},
			{
				id: "copy",
				label: "Copy link",
				disabled: !href && !pageId,
				onSelect: () => {
					void handleCopy();
				},
			},
			{
				id: "rename",
				label: "Rename",
				disabled: !pageId || !onRenamePage,
				onSelect: () => {
					setDraftTitle(title);
					setIsRenaming(true);
				},
			},
		];
	}, [handleCopy, handleOpen, href, onOpenPage, onRenamePage, pageId, title]);

	return (
		<NodeViewWrapper as="div" className="page-link" contentEditable={false}>
			<button
				type="button"
				className="card bg-primary text-primary-content"
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuPosition({ x: event.clientX, y: event.clientY });
					setMenuOpen(true);
				}}
				onClick={handleOpen}
			>
				<Link2 />
				<div className="flex-1">
					<div className="truncate font-medium">{title}</div>
					{pageId ? (
						<div className="text-xs text-base-content/50">{pageId}</div>
					) : null}
				</div>

				<div className="text-xs text-base-content/50">{pageId}</div>
			</button>

			{isRenaming ? (
				<div className="mt-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
					<input
						ref={inputRef}
						className="input input-bordered input-sm w-full"
						value={draftTitle}
						onChange={(event) => setDraftTitle(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								setIsRenaming(false);
								setDraftTitle(title);
								return;
							}
							if (event.key === "Enter") {
								event.preventDefault();
								void handleRename();
							}
						}}
						onBlur={() => {
							void handleRename();
						}}
					/>
				</div>
			) : null}
			<ContextMenu
				open={menuOpen}
				position={menuPosition}
				items={menuItems}
				onClose={closeMenu}
			/>
		</NodeViewWrapper>
	);
}
