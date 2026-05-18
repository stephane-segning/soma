import { SelectionAIBar } from "@soma/ui/components/editor/selection-ai-bar";
import { SelectionBubble, type BlockStyleOption } from "@soma/ui/components/editor/selection-bubble";
import { useT } from "@soma/ui/i18n";
import type { NodeAIRegistry } from "@soma/ui/components/editor/node-ai-registry.types";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AnimatePresence } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { applyBlockKind, BLOCK_KIND_ORDER, readCurrentBlockKind, type BlockKind } from "./block-rotation";
import { normalizeNodeName } from "../extensions/node-ai-registry";
import { readSelection, type SelectionSnapshot } from "./contextual-menu/selection";
import type { QuickActionRequest, QuickActionResponse, QuickActionType } from "./contextual-menu/types";

export type { QuickActionRequest, QuickActionResponse, QuickActionType };

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
}: {
	editor: Editor;
	registry: NodeAIRegistry | null;
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

	const openAI = useCallback(() => {
		const snapshot = readSelection(editor);
		if (!snapshot) return;
		setSelection(snapshot);
		setAiOpen(true);
	}, [editor]);

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
							nodeType={aiNodeType}
							onClose={() => setAiOpen(false)}
							registry={registry}
							selectedText={selection.text}
						/>
					</div>
				) : null}
			</AnimatePresence>
		</>
	);
}
