import { FloatingPortal, offset, shift, useFloating } from "@floating-ui/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { MoreVertical, MousePointer, Plus } from "react-feather";

type MenuState =
	| { show: false }
	| { show: true; pos: number; domNode: HTMLElement; rect: DOMRect };

const LEFT_MARGIN_PX = 45;

function findHoveredBlock(
	editor: Editor,
	event: MouseEvent,
): Omit<Extract<MenuState, { show: true }>, "rect"> | null {
	const view = editor.view;
	const editorRect = view.dom.getBoundingClientRect();

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

		const view = editor.view;

		const handleMouseMove = (event: MouseEvent) => {
			const hovered = findHoveredBlock(editor, event);
			if (!hovered) {
				setMenuState({ show: false });
				return;
			}

			const nodeRect = hovered.domNode.getBoundingClientRect();
			const editorRect = view.dom.getBoundingClientRect();
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
		};

		view.dom.addEventListener("mousemove", handleMouseMove);
		view.dom.addEventListener("scroll", handleScroll, true);

		return () => {
			view.dom.removeEventListener("mousemove", handleMouseMove);
			view.dom.removeEventListener("scroll", handleScroll, true);
		};
	}, [editor]);

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
					className="btn btn-soft btn-sm btn-circle"
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
						editor
							.chain()
							.insertContentAt(menuState.pos, { type: "paragraph" })
							.focus()
							.run();
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
		</FloatingPortal>
	);
}
