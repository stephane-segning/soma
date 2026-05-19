import { ContextMenu } from "@soma/ui/components/overlays/context-menu";
import { useT } from "@soma/ui/i18n";
import { cn } from "@soma/ui/utils/cn";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, type ReactNode, useCallback, useRef, useState } from "react";
import { Move, Plus, RefreshCw, Star } from "react-feather";
import { BLOCK_LABEL, readBlockKindFromNode, rotateBlock, type BlockKind } from "./block-rotation";
import { createAddMenuItems } from "./action-menu/add-menu-items";
import { normalizeNodeName } from "../extensions/node-ai-registry";
import type { NodeAITrigger } from "./contextual-menu";

type ActiveNode = {
	pos: number;
	insertPos: number;
	blockKind: BlockKind;
};

export function ActionMenu({
	editor,
	onInsertImage,
	onInsertFile,
	onAskAIForNode,
}: {
	editor: Editor | null;
	onInsertImage?: (editor: Editor, insertPos: number) => Promise<void>;
	onInsertFile?: (editor: Editor, insertPos: number) => Promise<void>;
	/**
	 * Called when the user clicks "AI" on the drag-handle menu for a block.
	 * The caller (DocumentEditor) relays the trigger into ContextualMenu so
	 * it can open the SelectionAIBar anchored at the block's handle position.
	 * When omitted the AI button is not rendered (registry not available).
	 */
	onAskAIForNode?: (trigger: NodeAITrigger) => void;
}): React.JSX.Element | null {
	const [activeNode, setActiveNode] = useState<ActiveNode | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [addMenuOpen, setAddMenuOpen] = useState(false);
	const [addMenuPosition, setAddMenuPosition] = useState({ x: 0, y: 0 });
	const addButtonRef = useRef<HTMLButtonElement | null>(null);
	const aiButtonRef = useRef<HTMLButtonElement | null>(null);

	const t = useT();
	const insertAt = useCallback((content: Record<string, unknown>) => {
		if (!editor || !activeNode) return;
		editor.chain().focus().insertContentAt(activeNode.insertPos, content).run();
	}, [activeNode, editor]);

	/**
	 * Handle the AI button click on the drag-handle menu.
	 *
	 * Steps:
	 *  1. Set a NodeSelection so TipTap / ProseMirror knows which block is
	 *     active. The NodeAIRegistryExtension reads this to build the context.
	 *  2. Resolve the block's text content directly from the node (so the bar
	 *     is populated even for empty blocks — it'll show the action list with
	 *     an empty `selectedText`).
	 *  3. Anchor the AI bar near the drag handle (right of the handle button).
	 *  4. Delegate to `onAskAIForNode` — DocumentEditor relays into
	 *     ContextualMenu's `nodeAITrigger` prop.
	 *
	 * Edge cases:
	 *  - Empty block (no text): selectedText is "". SelectionAIBar renders the
	 *    full action list; actions receive an empty `ctx.text`.
	 *  - Image / horizontal-rule blocks: `node.textContent` is "". The AI bar
	 *    still opens; the registry may return an empty action list for that
	 *    nodeType, showing "No matching actions". No crash.
	 *  - Code blocks: treated as text-bearing; the block's raw code is passed
	 *    as `selectedText`.
	 */
	const handleAIClick = useCallback(() => {
		if (!editor || !activeNode || !onAskAIForNode) return;

		// Set NodeSelection so the extension resolves surface = "node".
		editor.chain().setNodeSelection(activeNode.pos).run();

		// Read the block node text after setting the selection.
		const nodeAt = editor.state.doc.nodeAt(activeNode.pos);
		const blockText = nodeAt?.textContent ?? "";
		const rawNodeType = nodeAt?.type.name ?? "paragraph";
		const nodeType = normalizeNodeName(rawNodeType);

		// Block range covers the node from its start to immediately after
		// it. Actions that want to replace the block ([from, to)) use the
		// node's full ProseMirror size, mirroring what TipTap's
		// `insertContentAt({ from, to }, …)` expects.
		const from = activeNode.pos;
		const to = activeNode.pos + (nodeAt?.nodeSize ?? 0);

		// Anchor the bar next to the AI handle button if available,
		// otherwise fall back to a sensible default near the editor.
		const rect = aiButtonRef.current?.getBoundingClientRect();
		const anchor = rect
			? { x: rect.right + 12, y: rect.top + rect.height / 2 }
			: { x: window.innerWidth / 2, y: 100 };

		onAskAIForNode({
			pos: activeNode.pos,
			nodeType,
			text: blockText,
			from,
			to,
			anchor,
		});
	}, [editor, activeNode, onAskAIForNode]);

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
								onActivate={() => {
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
									values: {
										next: t({
											id: `block-kind.${activeNode.blockKind}`,
											defaultMessage: BLOCK_LABEL[activeNode.blockKind],
										}),
									},
								})}
								onActivate={() => {
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
							{onAskAIForNode ? (
								<HandleButton
									label={t({
										id: "action-menu.ai",
										defaultMessage: "Ask AI",
									})}
									onActivate={handleAIClick}
									ref={aiButtonRef}
								>
									<Star aria-hidden className="size-3.5" />
								</HandleButton>
							) : null}
							<div
								aria-label={t({
									id: "action-menu.drag",
									defaultMessage: "Drag block",
								})}
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
	{ label: string; onActivate: () => void; children: ReactNode }
>(function HandleButton({ label, onActivate, children }, ref) {
	return (
		<button
			aria-label={label}
			className="inline-flex size-7 items-center justify-center rounded-md text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
			onClick={onActivate}
			ref={ref}
			title={label}
			type="button"
		>
			{children}
		</button>
	);
});
