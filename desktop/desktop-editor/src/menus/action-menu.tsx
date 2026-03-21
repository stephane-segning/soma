import {
	ContextMenu,
	type ContextMenuItem,
} from "@soma/ui/components/overlays/context-menu";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Move, Plus, RefreshCw } from "react-feather";
import {
	getRotateActionLabel,
	readBlockKindFromNode,
	rotateBlock,
	type BlockKind,
} from "./block-rotation";

type ActiveNode = {
	pos: number;
	insertPos: number;
	blockKind: BlockKind;
};

export function ActionMenu({
	editor,
	onInsertImage,
	onInsertFile,
}: {
	editor: Editor | null;
	onInsertImage?: (editor: Editor, insertPos: number) => Promise<void>;
	onInsertFile?: (editor: Editor, insertPos: number) => Promise<void>;
}): React.JSX.Element | null {
	const [activeNode, setActiveNode] = useState<ActiveNode | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [addMenuOpen, setAddMenuOpen] = useState(false);
	const [addMenuPosition, setAddMenuPosition] = useState({ x: 0, y: 0 });
	const addButtonRef = useRef<HTMLButtonElement | null>(null);

	const insertAt = useCallback(
		(content: Record<string, unknown>) => {
			if (!editor || !activeNode) return;
			editor
				.chain()
				.focus()
				.insertContentAt(activeNode.insertPos, content)
				.run();
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

	const rotateActiveBlock = useCallback(() => {
		if (!editor || !activeNode) return;
		editor.chain().focus().setTextSelection(activeNode.pos + 1).run();
		rotateBlock(editor);
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
				id: "add-bullet-list",
				label: "Bulleted list",
				onSelect: () => insertAt({ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }),
			},
			{
				id: "add-numbered-list",
				label: "Numbered list",
				onSelect: () => insertAt({ type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }),
			},
			{
				id: "add-task-list",
				label: "Task list",
				onSelect: () =>
					insertAt({
						type: "taskList",
						content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }],
					}),
			},
			{
				id: "add-image-upload",
				label: "Image",
				onSelect: async () => {
					if (!editor || !activeNode || !onInsertImage) return;
					await onInsertImage(editor, activeNode.insertPos);
				},
			},
			{
				id: "add-file-upload",
				label: "File",
				onSelect: async () => {
					if (!editor || !activeNode || !onInsertFile) return;
					await onInsertFile(editor, activeNode.insertPos);
				},
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
								title: "Linked page",
								href: "/spaces/demo/pages/page_demo_789",
							},
						}),
			},
			{
				id: "add-text-rotate",
				label: "Text rotate (decorative)",
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
				label: "Carousel (decorative)",
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
				label: "Accordion (decorative)",
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
		[activeNode, editor, insertAt, onInsertFile, onInsertImage],
	);

	if (!editor) return null;

	return (
		<>
			<DragHandle
				className="z-40"
				computePositionConfig={{ placement: "left-start", strategy: "fixed" }}
				editor={editor}
				nested={false}
				onElementDragStart={() => setIsDragging(true)}
				onElementDragEnd={() => setIsDragging(false)}
					onNodeChange={({ node, pos }) => {
						if (!node || pos < 0) {
							setActiveNode(null);
							return;
						}
					setActiveNode({
						pos,
						insertPos: pos + node.nodeSize,
						blockKind: readBlockKindFromNode(node),
					});
				}}
			>
				<AnimatePresence initial={false}>
					{activeNode ? (
						<motion.div
							animate={{ opacity: 1, x: 0, scale: 1 }}
							className={[
								"flex flex-col items-center gap-1 rounded-xl bg-base-100/80 p-1 shadow-lg backdrop-blur-sm",
								isDragging ? "ring-2 ring-info/60" : "",
							].join(" ")}
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
							<button
								type="button"
								className="btn btn-soft btn-circle btn-sm"
								onMouseDown={(event) => {
									event.preventDefault();
									event.stopPropagation();
									rotateActiveBlock();
								}}
								title={getRotateActionLabel(activeNode.blockKind)}
							>
								<RefreshCw className="size-4" />
							</button>
							<div
								role="toolbar"
								data-drag-handle
								draggable
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
