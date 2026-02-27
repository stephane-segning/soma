import { FloatingPortal, offset, shift, useFloating } from "@floating-ui/react";
import {
	ContextMenu,
	type ContextMenuItem,
} from "@soma/ui/components/overlays/context-menu";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreVertical, MousePointer, Plus } from "react-feather";

type MenuState =
	| { show: false }
	| { show: true; pos: number; domNode: HTMLElement; rect: DOMRect };

const LEFT_MARGIN_PX = 45;

function getEditorView(editor: Editor): Editor["view"] | null {
	try {
		return editor.view;
	} catch {
		return null;
	}
}

function getEditorDom(editor: Editor): HTMLElement | null {
	const element = editor.options.element;
	return element instanceof HTMLElement ? element : null;
}

function findHoveredBlock(
	view: Editor["view"],
	editorDom: HTMLElement,
	event: MouseEvent,
): Omit<Extract<MenuState, { show: true }>, "rect"> | null {
	const editorRect = editorDom.getBoundingClientRect();

	const mouseOverEditor =
		event.clientX > editorRect.left - LEFT_MARGIN_PX &&
		event.clientX < editorRect.right &&
		event.clientY > editorRect.top &&
		event.clientY < editorRect.bottom;

	if (!mouseOverEditor) return null;

	const posAtCoords = view.posAtCoords({
		left: event.clientX,
		top: event.clientY,
	});
	if (!posAtCoords) return null;

	const $pos = view.state.doc.resolve(posAtCoords.pos);
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth);
		if (!node.isBlock) continue;

		const pos = $pos.before(depth);
		const nodeDom = view.nodeDOM(pos);
		const element =
			nodeDom instanceof HTMLElement
				? nodeDom
				: (nodeDom as Node | null)?.parentElement instanceof HTMLElement
					? (nodeDom as Node).parentElement
					: null;
		if (!element) continue;

		return { show: true, pos, domNode: element };
	}

	return null;
}

export function ActionMenu({
	editor,
}: {
	editor: Editor | null;
}): React.JSX.Element | null {
	const [menuState, setMenuState] = useState<MenuState>({ show: false });
	const [addMenuOpen, setAddMenuOpen] = useState(false);
	const [addMenuPosition, setAddMenuPosition] = useState({ x: 0, y: 0 });
	const [addMenuTargetPos, setAddMenuTargetPos] = useState<number | null>(null);
	const addButtonRef = useRef<HTMLButtonElement | null>(null);

	const { refs, floatingStyles } = useFloating({
		placement: "left-start",
		middleware: [offset(-5), shift()],
		strategy: "fixed",
	});

	const positionReference = useMemo(() => {
		if (!menuState.show) return null;
		return {
			getBoundingClientRect: () => menuState.rect,
			contextElement: menuState.domNode,
		};
	}, [menuState]);

	useEffect(() => {
		if (!positionReference) return;
		refs.setPositionReference(positionReference);
	}, [positionReference, refs]);

	useEffect(() => {
		if (!editor) return;

		const editorDom = getEditorDom(editor);
		if (!editorDom) return;

		const view = getEditorView(editor);
		if (!view) return;

		const handleMouseMove = (event: MouseEvent) => {
			const hovered = findHoveredBlock(view, editorDom, event);
			if (!hovered) {
				setMenuState({ show: false });
				return;
			}

			const nodeRect = hovered.domNode.getBoundingClientRect();
			const editorRect = editorDom.getBoundingClientRect();
			const rect = DOMRect.fromRect({
				x: editorRect.x - 10,
				y: nodeRect.y,
				width: 0,
				height: nodeRect.height,
			});

			setMenuState({ ...hovered, rect });
		};

		const handleScroll = () => {
			setMenuState({ show: false });
			setAddMenuOpen(false);
		};

		editorDom.addEventListener("mousemove", handleMouseMove);
		editorDom.addEventListener("scroll", handleScroll, true);

		return () => {
			editorDom.removeEventListener("mousemove", handleMouseMove);
			editorDom.removeEventListener("scroll", handleScroll, true);
		};
	}, [editor]);

	const insertAt = useCallback(
		(content: Record<string, unknown>) => {
			if (!editor) return;

			const pos =
				addMenuTargetPos ?? ("pos" in menuState ? menuState.pos : undefined);
			if (pos) {
				editor.chain().focus().insertContentAt(pos, content).run();
			}
		},
		[addMenuTargetPos, editor, menuState],
	);

	const openAddMenu = useCallback(() => {
		if (!editor) return;
		const button = addButtonRef.current;
		if (!button) return;
		const pos = "pos" in menuState ? menuState.pos : undefined;
		if (!pos) return;

		const rect = button.getBoundingClientRect();
		setAddMenuPosition({ x: rect.right + 8, y: rect.top });
		setAddMenuTargetPos(pos);
		setAddMenuOpen(true);
	}, [menuState, editor]);

	const addMenuItems = useMemo<ContextMenuItem[]>(
		() => [
			{
				id: "add-paragraph",
				label: "Paragraph",
				onSelect: () => insertAt({ type: "paragraph" }),
			},
			{
				id: "add-heading-2",
				label: "Heading",
				onSelect: () => insertAt({ type: "heading", attrs: { level: 2 } }),
			},
			{
				id: "add-divider",
				label: "Divider",
				onSelect: () => insertAt({ type: "horizontalRule" }),
			},
			{
				id: "add-code",
				label: "Code block",
				onSelect: () => insertAt({ type: "codeBlock" }),
			},
			{
				id: "add-page-link",
				label: "Page link",
				onSelect: () =>
					insertAt({
						type: "pageLink",
						attrs: {
							pageId: "page_demo_789",
							title: "New page link",
							href: "/spaces/demo/pages/page_demo_789",
						},
					}),
			},
			{
				id: "add-external-link",
				label: "External link",
				onSelect: () =>
					insertAt({
						type: "pageLink",
						attrs: {
							title: "DaisyUI",
							href: "https://daisyui.com",
						},
					}),
			},
			{
				id: "add-text-rotate",
				label: "Text rotate",
				onSelect: () =>
					insertAt({
						type: "textRotate",
						attrs: {
							items: ["Design", "Ship", "Iterate"],
						},
					}),
			},
			{
				id: "add-carousel",
				label: "Carousel",
				onSelect: () =>
					insertAt({
						type: "carousel",
						attrs: {
							items: [
								{
									src: "https://placehold.co/600x320/png?text=Slide+1",
								},
								{
									src: "https://placehold.co/600x320/png?text=Slide+2",
								},
								{
									src: "https://placehold.co/600x320/png?text=Slide+3",
								},
							],
						},
					}),
			},
			{
				id: "add-accordion",
				label: "Accordion",
				onSelect: () =>
					insertAt({
						type: "accordion",
						attrs: {
							collapseType: "arrow",
							items: [
								{
									title: "Accordion Item 1",
									content: "Add accordion content here.",
								},
								{
									title: "Accordion Item 2",
									content: "Second item details.",
								},
							],
						},
					}),
			},
		],
		[insertAt],
	);

	if (!editor || !menuState.show) return null;

	return (
		<FloatingPortal>
			<div
				ref={refs.setFloating}
				style={floatingStyles}
				className="z-40 flex flex-col items-center gap-1 p-1 mr-1"
			>
				<button
					type="button"
					ref={addButtonRef}
					className="btn btn-soft btn-sm btn-circle"
					onMouseDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
						openAddMenu();
					}}
				>
					<Plus className="size-4" />
				</button>
				<div
					role="toolbar"
					data-drag-handle
					draggable
					className="btn btn-soft btn-circle btn-sm cursor-grab active:cursor-grabbing"
				>
					<MousePointer className="size-4" />
				</div>
				<button type="button" className="btn btn-soft btn-sm btn-circle">
					<MoreVertical className="size-4" />
				</button>
			</div>
			<ContextMenu
				open={addMenuOpen}
				position={addMenuPosition}
				items={addMenuItems}
				onClose={() => setAddMenuOpen(false)}
			/>
		</FloatingPortal>
	);
}
