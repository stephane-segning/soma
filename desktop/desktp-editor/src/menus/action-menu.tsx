import { DragHandle } from "@tiptap/extension-drag-handle-react";
import {
	ContextMenu,
	type ContextMenuItem,
} from "@soma/ui/components/overlays/context-menu";
import { AnimatePresence, motion } from "motion/react";
import type { Editor } from "@tiptap/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Move, Plus } from "react-feather";

type ActiveNode = {
	insertPos: number;
};

export function ActionMenu({
	editor,
}: {
	editor: Editor | null;
}): React.JSX.Element | null {
	const [activeNode, setActiveNode] = useState<ActiveNode | null>(null);
	const [addMenuOpen, setAddMenuOpen] = useState(false);
	const [addMenuPosition, setAddMenuPosition] = useState({ x: 0, y: 0 });
	const addButtonRef = useRef<HTMLButtonElement | null>(null);

	const insertAt = useCallback(
		(content: Record<string, unknown>) => {
			if (!editor || !activeNode) return;
			editor.chain().focus().insertContentAt(activeNode.insertPos, content).run();
		},
		[activeNode, editor],
	);

	const openAddMenu = useCallback(() => {
		if (!editor || !activeNode) return;
		const button = addButtonRef.current;
		if (!button) return;

		const rect = button.getBoundingClientRect();
		setAddMenuPosition({ x: rect.right + 8, y: rect.top });
		setAddMenuOpen(true);
	}, [activeNode, editor]);

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

	if (!editor) return null;

	return (
		<>
			<DragHandle
				className="z-40"
				computePositionConfig={{ placement: "left-start", strategy: "fixed" }}
				editor={editor}
				nested
				onNodeChange={({ node, pos }) => {
					if (!node || pos < 0) {
						setActiveNode(null);
						return;
					}
					setActiveNode({ insertPos: pos + node.nodeSize });
				}}
			>
				<AnimatePresence initial={false}>
					{activeNode ? (
						<motion.div
							animate={{ opacity: 1, x: 0, scale: 1 }}
							className="flex flex-col items-center gap-1 rounded-xl bg-base-100/80 p-1 shadow-lg backdrop-blur-sm"
							exit={{ opacity: 0, x: -6, scale: 0.96 }}
							initial={{ opacity: 0, x: -8, scale: 0.96 }}
							transition={{ duration: 0.14 }}
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
								className="btn btn-soft btn-circle btn-sm cursor-grab active:cursor-grabbing"
								title="Drag block"
							>
								<Move className="size-4" />
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</DragHandle>

			<ContextMenu
				open={addMenuOpen}
				position={addMenuPosition}
				items={addMenuItems}
				onClose={() => setAddMenuOpen(false)}
			/>
		</>
	);
}
