import { offset, shift } from "@floating-ui/react";
import { ContextMenu } from "@soma/ui/components/overlays/context-menu";
import { useT } from "@soma/ui/i18n";
import { cn } from "@soma/ui/utils/cn";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Move, Plus, RefreshCw, Star, Trash2, Type } from "react-feather";
import { applyBlockKind, BLOCK_KIND_ORDER, BLOCK_LABEL, readBlockKindFromNode, type BlockKind } from "./block-rotation";
import { createAddMenuItems } from "./action-menu/add-menu-items";
import { deleteBlock, moveBlock } from "./action-menu/move-block";
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
	const [convertMenuOpen, setConvertMenuOpen] = useState(false);
	const [convertMenuPosition, setConvertMenuPosition] = useState({ x: 0, y: 0 });
	const addButtonRef = useRef<HTMLButtonElement | null>(null);
	const convertButtonRef = useRef<HTMLButtonElement | null>(null);
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

	// Convert-to picker — one row per block kind, mirrors the slash-menu
	// transform commands. Clicking a row closes the picker and applies the
	// transform via `applyBlockKind`. We compute the items only when the
	// menu is open to avoid running the loop on every drag-handle render.
	const convertMenuItems = activeNode && editor
		? BLOCK_KIND_ORDER.map((kind) => ({
				id: `convert-${kind}`,
				label: t({ id: `block-kind.${kind}`, defaultMessage: BLOCK_LABEL[kind] }),
				icon: kind === activeNode.blockKind ? <RefreshCw className="size-4" /> : undefined,
				onSelect: () => {
					// No-op when the chosen kind is already the active kind.
					// `applyBlockKind` uses `toggle*` commands for lists / quote
					// / code, so re-clicking the active row would strip the
					// formatting back toward paragraph — surprising behaviour
					// that codex flagged. Selecting the active row simply
					// closes the menu now.
					if (kind === activeNode.blockKind) return;
					editor.chain().focus().setTextSelection(activeNode.pos + 1).run();
					applyBlockKind(editor, kind);
				},
			}))
		: [];

	// Stable identity for every prop the DragHandle hands to its plugin —
	// `@tiptap/extension-drag-handle-react` puts these in a useEffect
	// dependency list, and a new function on each render unregisters and
	// re-registers the ProseMirror plugin. The re-registration reconfigures
	// the editor's plugin list, which resets the suggestion plugin's state
	// (so the slash menu would vanish the instant the mouse moved).
	const handleNodeChange = useCallback(
		({ node, pos }: { node: PMNode | null; pos: number }) => {
			if (!node || pos < 0) {
				setActiveNode(null);
				return;
			}
			setActiveNode({ pos, insertPos: pos + node.nodeSize, blockKind: readBlockKindFromNode(node) });
		},
		[],
	);
	const handleDragStart = useCallback(() => setIsDragging(true), []);
	const handleDragEnd = useCallback(() => setIsDragging(false), []);
	// `offset(8)` keeps a small breathing gap between the handle and the
	// block it anchors to. `shift({ padding: 8 })` keeps the handle inside
	// the viewport on narrow screens where the editor padding doesn't
	// leave room for a `left-start` placement — without it the handle
	// clips behind the window edge.
	const computePositionConfig = useMemo(
		() => ({
			placement: "left-start" as const,
			strategy: "fixed" as const,
			middleware: [offset(8), shift({ padding: 8 })],
		}),
		[],
	);

	if (!editor) return null;

	return (
		<>
			<DragHandle
				className="z-40"
				computePositionConfig={computePositionConfig}
				editor={editor}
				nested={false}
				onElementDragStart={handleDragStart}
				onElementDragEnd={handleDragEnd}
				onNodeChange={handleNodeChange}
			>
				<AnimatePresence initial={false}>
					{activeNode ? (
						<motion.div
							animate={{ opacity: 1, x: 0 }}
							className={cn(
								"glass-panel shadow-elevated flex flex-col items-center gap-0.5 p-1",
								isDragging && "ring-2 ring-info/60",
							)}
							exit={{ opacity: 0, x: -6 }}
							initial={{ opacity: 0, x: -8 }}
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
								label={t({ id: "action-menu.convert", defaultMessage: "Convert to…" })}
								onActivate={() => {
									const rect = convertButtonRef.current?.getBoundingClientRect();
									if (!rect) return;
									setConvertMenuPosition({ x: rect.right + 8, y: rect.top });
									setConvertMenuOpen(true);
								}}
								ref={convertButtonRef}
							>
								<Type aria-hidden className="size-3.5" />
							</HandleButton>
							<HandleButton
								label={t({ id: "action-menu.move-up", defaultMessage: "Move up" })}
								onActivate={() => moveBlock(editor, activeNode.pos, "up")}
							>
								<ChevronUp aria-hidden className="size-3.5" />
							</HandleButton>
							<HandleButton
								label={t({ id: "action-menu.move-down", defaultMessage: "Move down" })}
								onActivate={() => moveBlock(editor, activeNode.pos, "down")}
							>
								<ChevronDown aria-hidden className="size-3.5" />
							</HandleButton>
							<HandleButton
								label={t({ id: "action-menu.delete", defaultMessage: "Delete block" })}
								onActivate={() => deleteBlock(editor, activeNode.pos)}
							>
								<Trash2 aria-hidden className="size-3.5" />
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
			<ContextMenu
				items={convertMenuItems}
				onClose={() => setConvertMenuOpen(false)}
				open={convertMenuOpen}
				position={convertMenuPosition}
			/>
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
			draggable={false}
			// `@tiptap/extension-drag-handle` sets `draggable=true` on the
			// outer wrapper so it can intercept dragstart and initiate the
			// node move. Without these handlers, click-and-drag on any of
			// the action buttons (Add, Rotate, AI) would also start a drag
			// — confusing UX. Cancel both the native drag attribute *and*
			// the bubbled event so only the dedicated grip-handle triggers.
			onDragStart={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
			onClick={onActivate}
			ref={ref}
			title={label}
			type="button"
		>
			{children}
		</button>
	);
});
