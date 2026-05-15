import { ContextMenu } from "@soma/ui/components/overlays/context-menu";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { Move, Plus, RefreshCw } from "react-feather";
import { getRotateActionLabel, readBlockKindFromNode, rotateBlock, type BlockKind } from "./block-rotation";
import { createAddMenuItems } from "./action-menu/add-menu-items";

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

	const insertAt = useCallback((content: Record<string, unknown>) => {
		if (!editor || !activeNode) return;
		editor.chain().focus().insertContentAt(activeNode.insertPos, content).run();
	}, [activeNode, editor]);

	const addMenuItems = createAddMenuItems({ activeNode, editor, insertAt, onInsertFile, onInsertImage });
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
					if (!node || pos < 0) return setActiveNode(null);
					setActiveNode({ pos, insertPos: pos + node.nodeSize, blockKind: readBlockKindFromNode(node) });
				}}
			>
				<AnimatePresence initial={false}>
					{activeNode ? (
						<motion.div
							animate={{ opacity: 1, x: 0, scale: 1 }}
							className={["flex flex-col items-center gap-1 rounded-xl bg-base-100/80 p-1 shadow-lg backdrop-blur-sm", isDragging ? "ring-2 ring-info/60" : ""].join(" ")}
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
									const rect = addButtonRef.current?.getBoundingClientRect();
									if (!rect) return;
									setAddMenuPosition({ x: rect.right + 8, y: rect.top });
									setAddMenuOpen(true);
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
									editor.chain().focus().setTextSelection(activeNode.pos + 1).run();
									rotateBlock(editor);
								}}
								title={getRotateActionLabel(activeNode.blockKind)}
							>
								<RefreshCw className="size-4" />
							</button>
							<div role="toolbar" data-drag-handle draggable className="btn btn-soft btn-circle btn-sm cursor-grab active:cursor-grabbing" title="Drag block">
								<Move className="size-4" />
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</DragHandle>
			<ContextMenu open={addMenuOpen} position={addMenuPosition} items={addMenuItems} onClose={() => setAddMenuOpen(false)} />
		</>
	);
}
