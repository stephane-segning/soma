import { ContextMenu } from "@soma/ui/components/overlays/context-menu";
import { useT } from "@soma/ui/i18n";
import { cn } from "@soma/ui/utils/cn";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, type ReactNode, useCallback, useRef, useState } from "react";
import { Move, Plus, RefreshCw } from "react-feather";
import { BLOCK_LABEL, readBlockKindFromNode, rotateBlock, type BlockKind } from "./block-rotation";
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

	const t = useT();
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
							className={cn(
								"glass-panel shadow-elevated flex flex-col items-center gap-0.5 p-1",
								isDragging && "ring-2 ring-info/60",
							)}
							exit={{ opacity: 0, x: -6, scale: 0.96 }}
							initial={{ opacity: 0, x: -8, scale: 0.96 }}
							transition={{ duration: 0.14 }}
						>
							<HandleButton
								label={t({ id: "action-menu.add", defaultMessage: "Add block" })}
								onMouseDown={() => {
									const rect = addButtonRef.current?.getBoundingClientRect();
									if (!rect) return;
									setAddMenuPosition({ x: rect.right + 8, y: rect.top });
									setAddMenuOpen(true);
								}}
								ref={addButtonRef}
							>
								<Plus aria-hidden className="size-3.5" />
							</HandleButton>
							<HandleButton
								label={t({
									id: "action-menu.rotate",
									defaultMessage: "Change to {next}",
									values: { next: BLOCK_LABEL[activeNode.blockKind] },
								})}
								onMouseDown={() => {
									editor
										.chain()
										.focus()
										.setTextSelection(activeNode.pos + 1)
										.run();
									rotateBlock(editor);
								}}
							>
								<RefreshCw aria-hidden className="size-3.5" />
							</HandleButton>
							<div
								className="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-base-content/70 hover:bg-base-200 hover:text-base-content active:cursor-grabbing"
								data-drag-handle
								draggable
								role="toolbar"
								title={t({ id: "action-menu.drag", defaultMessage: "Drag block" })}
							>
								<Move aria-hidden className="size-3.5" />
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</DragHandle>
			<ContextMenu open={addMenuOpen} position={addMenuPosition} items={addMenuItems} onClose={() => setAddMenuOpen(false)} />
		</>
	);
}

const HandleButton = forwardRef<
	HTMLButtonElement,
	{ label: string; onMouseDown: () => void; children: ReactNode }
>(function HandleButton({ label, onMouseDown, children }, ref) {
	return (
		<button
			aria-label={label}
			className="inline-flex size-7 items-center justify-center rounded-md text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
			onMouseDown={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onMouseDown();
			}}
			ref={ref}
			title={label}
			type="button"
		>
			{children}
		</button>
	);
});
