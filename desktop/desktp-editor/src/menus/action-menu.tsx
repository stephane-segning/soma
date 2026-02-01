import { FloatingPortal, offset, shift, useFloating } from "@floating-ui/react";
import { Editor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { useEffect, useMemo, useState } from "react";

type MenuState =
	| { show: false }
	| { show: true; pos: number; domNode: HTMLElement; rect: DOMRect };

const LEFT_MARGIN_PX = 45;

function findHoveredBlock(editor: Editor, event: MouseEvent): Omit<Extract<MenuState, { show: true }>, "rect"> | null {
	const view = editor.view;
	const editorRect = view.dom.getBoundingClientRect();

	const mouseOverEditor =
		event.clientX > editorRect.left - LEFT_MARGIN_PX &&
		event.clientX < editorRect.right &&
		event.clientY > editorRect.top &&
		event.clientY < editorRect.bottom;

	if (!mouseOverEditor) return null;

	const posAtCoords = view.posAtCoords({ left: event.clientX, top: event.clientY });
	if (!posAtCoords) return null;

	const $pos = view.state.doc.resolve(posAtCoords.pos);
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth);
		if (!node.isBlock) continue;

		const pos = $pos.before(depth);
		const nodeDom = view.nodeDOM(pos);
		const element =
			nodeDom instanceof HTMLElement ? nodeDom : (nodeDom as Node | null)?.parentElement instanceof HTMLElement ? (nodeDom as Node).parentElement : null;
		if (!element) continue;

		return { show: true, pos, domNode: element };
	}

	return null;
}

export function ActionMenu({ editor }: { editor: Editor | null }): React.JSX.Element | null {
	const [menuState, setMenuState] = useState<MenuState>({ show: false });

	const { refs, floatingStyles } = useFloating({
		placement: "left",
		middleware: [offset(-10), shift()],
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
				className="z-40 flex items-center gap-1 rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg"
			>
				<button
					type="button"
					className="btn btn-ghost btn-xs"
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
						editor.chain().insertContentAt(menuState.pos, { type: "paragraph" }).focus().run();
					}}
				>
					+
				</button>
				<div
					draggable
					className="btn btn-ghost btn-xs cursor-grab active:cursor-grabbing"
					onDragStart={(event) => {
						event.stopPropagation();

						const view = editor.view;
						view.focus();
						view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, menuState.pos)));

						const slice = view.state.selection.content();
						const { dom, text } = view.serializeForClipboard(slice);

						event.dataTransfer?.clearData();
						event.dataTransfer!.effectAllowed = "copyMove";
						event.dataTransfer!.setData("text/html", dom.innerHTML);
						event.dataTransfer!.setData("text/plain", text);
						event.dataTransfer!.setDragImage(menuState.domNode, 0, 0);

						// ProseMirror uses `view.dragging` to coordinate a "move" drop.
						view.dragging = { slice, move: true };
					}}
					onDragEnd={() => {
						const view = editor.view;
						view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
						view.dom.blur();
					}}
				>
					drag
				</div>
			</div>
		</FloatingPortal>
	);
}
