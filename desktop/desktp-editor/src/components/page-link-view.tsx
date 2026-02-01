import {
	ContextMenu,
	type ContextMenuItem,
} from "@soma/ui/components/overlays/context-menu";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2 } from "react-feather";

function formatLinkLabel(href: string): string {
	try {
		if (href.startsWith("/") || href.startsWith("#")) return href;
		const url = new URL(href, "https://example.com");
		const host = url.hostname.replace(/^www\./, "");
		const path = url.pathname === "/" ? "" : url.pathname;
		return `${host}${path}`;
	} catch {
		return href;
	}
}

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
		if (pageId && onOpenPage) {
			onOpenPage(pageId, title, href);
			return;
		}
		if (href) {
			window.open(href, "_blank", "noreferrer");
		}
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
		const trimmed = draftTitle.trim();
		if (!trimmed || trimmed === title) {
			setIsRenaming(false);
			return;
		}
		if (!pageId || !onRenamePage) {
			updateAttributes({ title: trimmed });
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
				label: pageId ? "Open page" : "Open link",
				disabled: (!pageId || !onOpenPage) && !href,
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
				disabled: pageId ? !onRenamePage : false,
				onSelect: () => {
					setDraftTitle(title);
					setIsRenaming(true);
				},
			},
		];
	}, [handleCopy, handleOpen, href, onOpenPage, onRenamePage, pageId, title]);

	const subtitle = useMemo(() => {
		if (pageId) return pageId;
		if (href) return formatLinkLabel(href);
		return null;
	}, [href, pageId]);

	return (
		<NodeViewWrapper
			as="div"
			className="page-link text-[1em]"
			contentEditable={false}
		>
			<button
				type="button"
				className="card bg-primary text-primary-content text-[0.95em]"
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuPosition({ x: event.clientX, y: event.clientY });
					setMenuOpen(true);
				}}
				onClick={handleOpen}
			>
				<Link2 className="size-[1.2em]" />
				<div className="flex-1">
					<div className="truncate font-medium">{title}</div>
					{subtitle ? (
						<div className="text-[0.75em] text-base-content/60">
							{subtitle}
						</div>
					) : null}
				</div>
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
