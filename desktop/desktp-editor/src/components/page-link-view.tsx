import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function PageLinkView({ node, extension, updateAttributes }: NodeViewProps): React.JSX.Element {
	const title = (node.attrs.title as string | undefined) ?? "Untitled page";
	const pageId = node.attrs.pageId as string | undefined;
	const href = node.attrs.href as string | undefined;
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
	const menuRef = useRef<HTMLDivElement | null>(null);

	const onOpenPage = useMemo(() => {
		return (extension.options as { onOpen?: (pageId: string, title?: string, href?: string) => void } | undefined)?.onOpen;
	}, [extension.options]);

	const onRenamePage = useMemo(() => {
		return (extension.options as { onRename?: (pageId: string, currentTitle?: string) => string | null | Promise<string | null> } | undefined)
			?.onRename;
	}, [extension.options]);

	const closeMenu = useCallback(() => {
		setMenuOpen(false);
	}, []);

	useEffect(() => {
		if (!menuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (menuRef.current && target && menuRef.current.contains(target)) return;
			setMenuOpen(false);
		};
		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [menuOpen]);

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
		if (!pageId || !onRenamePage) return;
		const nextTitle = await onRenamePage(pageId, title);
		if (!nextTitle || nextTitle === title) return;
		updateAttributes({ title: nextTitle });
	}, [onRenamePage, pageId, title, updateAttributes]);

	return (
		<NodeViewWrapper as="div" className="my-2" contentEditable={false}>
			<button
				type="button"
				className="flex w-full items-center gap-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-left text-sm shadow-sm hover:bg-base-200/60"
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuPosition({ x: event.clientX, y: event.clientY });
					setMenuOpen(true);
				}}
				onClick={handleOpen}
			>
				<div className="flex-1 truncate font-medium">{title}</div>
				{pageId ? <div className="text-xs text-base-content/50">{pageId}</div> : null}
			</button>
			{menuOpen ? (
				<div
					ref={menuRef}
					className="fixed z-50 min-w-48 overflow-hidden rounded-xl border border-base-300 bg-base-100 p-1 shadow-xl"
					style={{ top: menuPosition.y, left: menuPosition.x }}
				>
					<button
						type="button"
						disabled={!pageId || !onOpenPage}
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-200 disabled:opacity-50"
						onClick={() => {
							handleOpen();
							closeMenu();
						}}
					>
						Open in new tab
					</button>
					<button
						type="button"
						disabled={!href && !pageId}
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-200 disabled:opacity-50"
						onClick={async () => {
							await handleCopy();
							closeMenu();
						}}
					>
						Copy link
					</button>
					<button
						type="button"
						disabled={!pageId || !onRenamePage}
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-200 disabled:opacity-50"
						onClick={async () => {
							await handleRename();
							closeMenu();
						}}
					>
						Rename
					</button>
				</div>
			) : null}
		</NodeViewWrapper>
	);
}
