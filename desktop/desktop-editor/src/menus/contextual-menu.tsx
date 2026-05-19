import { SelectionAIBar } from "@soma/ui/components/editor/selection-ai-bar";
import { SelectionBubble, type BlockStyleOption } from "@soma/ui/components/editor/selection-bubble";
import { useT } from "@soma/ui/i18n";
import type { NodeAIRegistry } from "@soma/ui/components/editor/node-ai-registry.types";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { applyBlockKind, BLOCK_KIND_ORDER, readCurrentBlockKind, type BlockKind } from "./block-rotation";
import { normalizeNodeName } from "../extensions/node-ai-registry";
import { readSelection, type SelectionSnapshot } from "./contextual-menu/selection";
import type { QuickActionRequest, QuickActionResponse, QuickActionType } from "./contextual-menu/types";

export type { QuickActionRequest, QuickActionResponse, QuickActionType };

/**
 * Describes a block that was targeted from the drag-handle AI button.
 * The `pos` is the ProseMirror position of the block node's start;
 * `from` / `to` cover the full block range (inclusive of its boundary
 * tokens) so that registry actions that mutate the document have
 * enough information to do an `insertContentAt({from, to}, …)` call.
 */
export type NodeAITrigger = {
	pos: number;
	nodeType: string;
	text: string;
	/** Inclusive ProseMirror range covering the block node. */
	from: number;
	to: number;
	/** Screen coordinates for the AI bar anchor (derived from the handle position). */
	anchor: { x: number; y: number };
};

const BLOCK_LABEL_KEYS: Record<BlockKind, { id: string; defaultMessage: string }> = {
	paragraph: { id: "editor.block.paragraph", defaultMessage: "Paragraph" },
	"heading-2": { id: "editor.block.heading-2", defaultMessage: "Heading 2" },
	"heading-3": { id: "editor.block.heading-3", defaultMessage: "Heading 3" },
	"bullet-list": { id: "editor.block.bullet-list", defaultMessage: "Bullet List" },
	"ordered-list": { id: "editor.block.ordered-list", defaultMessage: "Numbered List" },
	"task-list": { id: "editor.block.task-list", defaultMessage: "Task List" },
	blockquote: { id: "editor.block.blockquote", defaultMessage: "Quote" },
	"code-block": { id: "editor.block.code-block", defaultMessage: "Code Block" },
};

export function ContextualMenu({
	editor,
	registry,
	nodeAITrigger,
	onNodeAIClose,
}: {
	editor: Editor;
	registry: NodeAIRegistry | null;
	/**
	 * When set, the ContextualMenu opens the AI bar for the identified block
	 * (triggered from the drag-handle AI button in ActionMenu). The caller
	 * sets this to a {@link NodeAITrigger} on click and resets it to `null`
	 * via {@link onNodeAIClose} when the bar is dismissed.
	 */
	nodeAITrigger?: NodeAITrigger | null;
	onNodeAIClose?: () => void;
}) {
	const t = useT();
	const blockLabel = useMemo<Record<BlockKind, string>>(() => {
		const map = {} as Record<BlockKind, string>;
		for (const kind of BLOCK_KIND_ORDER) {
			map[kind] = t(BLOCK_LABEL_KEYS[kind]);
		}
		return map;
	}, [t]);
	const blockStyleOptions = useMemo<BlockStyleOption[]>(
		() => BLOCK_KIND_ORDER.map((kind) => ({ id: kind, label: blockLabel[kind] })),
		[blockLabel],
	);

	const [aiOpen, setAiOpen] = useState(false);
	const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
	const [nodeAIOpen, setNodeAIOpen] = useState(false);
	// Local copy of the most recent trigger. Keeping it here lets the popover
	// finish its exit animation after the parent clears its prop, and avoids
	// any null-dereference window during the unmount transition.
	const [nodeTrigger, setNodeTrigger] = useState<NodeAITrigger | null>(null);

	// When an external node AI trigger arrives (from the drag-handle AI button),
	// open the node-level AI bar. Opening the node bar also closes any open
	// selection-level bar to keep the two surfaces mutually exclusive.
	useEffect(() => {
		if (nodeAITrigger) {
			setNodeTrigger(nodeAITrigger);
			setNodeAIOpen(true);
			setAiOpen(false);
		}
	}, [nodeAITrigger]);

	const openAI = useCallback(() => {
		const snapshot = readSelection(editor);
		if (!snapshot) return;
		setSelection(snapshot);
		setAiOpen(true);
		// Mutually exclusive with the node-surface bar.
		setNodeAIOpen(false);
	}, [editor]);

	const closeNodeAI = useCallback(() => {
		setNodeAIOpen(false);
		onNodeAIClose?.();
	}, [onNodeAIClose]);

	const blockKind: BlockKind = readCurrentBlockKind(editor);
	const linkUrl = (editor.getAttributes("link")?.href as string | undefined) ?? null;
	const rawNodeType = editor.state.selection.$from.parent.type.name;
	const aiNodeType = useMemo(() => normalizeNodeName(rawNodeType), [rawNodeType]);

	return (
		<>
			<BubbleMenu className="bubble-menu" editor={editor}>
				<SelectionBubble
					blockStyle={{ id: blockKind, label: blockLabel[blockKind] }}
					blockStyleOptions={blockStyleOptions}
					bold={editor.isActive("bold")}
					code={editor.isActive("code")}
					italic={editor.isActive("italic")}
					linkUrl={linkUrl}
					onAskAI={registry ? openAI : undefined}
					onChangeBlockStyle={(id) => applyBlockKind(editor, id as BlockKind)}
					onSetLink={(url) => {
						const chain = editor.chain().focus().extendMarkRange("link");
						if (url === null) {
							chain.unsetLink().run();
						} else {
							chain.setLink({ href: url }).run();
						}
					}}
					onToggleBold={() => editor.chain().focus().toggleBold().run()}
					onToggleCode={() => editor.chain().focus().toggleCode().run()}
					onToggleItalic={() => editor.chain().focus().toggleItalic().run()}
					onToggleStrike={() => editor.chain().focus().toggleStrike().run()}
					onToggleUnderline={() => editor.chain().focus().toggleUnderline().run()}
					strike={editor.isActive("strike")}
					underline={editor.isActive("underline")}
				/>
			</BubbleMenu>
			<AnimatePresence>
				{aiOpen && selection && registry ? (
					<div
						className="fixed z-50"
						style={{
							left: selection.anchor.x,
							top: selection.anchor.y,
							transform: "translateX(-50%)",
						}}
					>
						<SelectionAIBar
							metadata={{ from: selection.range.from, to: selection.range.to }}
							nodeType={aiNodeType}
							onClose={() => setAiOpen(false)}
							registry={registry}
							selectedText={selection.text}
						/>
					</div>
				) : null}
			</AnimatePresence>
			<AnimatePresence>
				{nodeAIOpen && nodeTrigger && registry ? (
					<div
						className="fixed z-50"
						style={{
							left: nodeTrigger.anchor.x,
							top: nodeTrigger.anchor.y,
						}}
					>
						<SelectionAIBar
							metadata={{ from: nodeTrigger.from, to: nodeTrigger.to }}
							nodeType={nodeTrigger.nodeType}
							onClose={closeNodeAI}
							registry={registry}
							selectedText={nodeTrigger.text}
						/>
					</div>
				) : null}
			</AnimatePresence>
		</>
	);
}
