import { SelectionBubble, type BlockStyleOption } from "@soma/ui/components/editor/selection-bubble";
import { useT } from "@soma/ui/i18n";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AnimatePresence } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { applyBlockKind, BLOCK_KIND_ORDER, readCurrentBlockKind, type BlockKind } from "./block-rotation";
import { QuickActionPanel } from "./contextual-menu/quick-action-panel";
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
	onQuickAction,
}: {
	editor: Editor;
	onQuickAction?: (input: QuickActionRequest) => Promise<QuickActionResponse>;
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
	const [panelOpen, setPanelOpen] = useState(false);
	const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
	const [runningAction, setRunningAction] = useState<QuickActionType | null>(null);
	const [resultText, setResultText] = useState("");
	const [resultTone, setResultTone] = useState<"default" | "error">("default");

	const openQuickActions = useCallback(() => {
		const snapshot = readSelection(editor);
		if (!snapshot) return;
		setSelection(snapshot);
		setResultText("");
		setResultTone("default");
		setPanelOpen(true);
	}, [editor]);

	const runQuickAction = useCallback(
		async (action: QuickActionType) => {
			if (!onQuickAction || !selection || runningAction) return;
			setRunningAction(action);
			setResultText("");
			setResultTone("default");
			try {
				const response = await onQuickAction({ action, selectionText: selection.text });
				if (action === "expand" && response.status === "done" && response.content?.trim()) {
					editor.chain().focus().insertContentAt(selection.range, response.content.trim()).run();
				}
				setResultText(resultMessage(action, response));
			} catch (error) {
				setResultTone("error");
				setResultText(error instanceof Error ? error.message : String(error));
			} finally {
				setRunningAction(null);
			}
		},
		[editor, onQuickAction, runningAction, selection],
	);

	const blockKind: BlockKind = readCurrentBlockKind(editor);
	const linkUrl = (editor.getAttributes("link")?.href as string | undefined) ?? null;

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
					onAskAI={onQuickAction ? openQuickActions : undefined}
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
				{panelOpen && selection ? (
					<QuickActionPanel
						resultText={resultText}
						resultTone={resultTone}
						runningAction={runningAction}
						selection={selection}
						onRun={runQuickAction}
					/>
				) : null}
			</AnimatePresence>
		</>
	);
}

function resultMessage(action: QuickActionType, response: QuickActionResponse): string {
	if (action === "research") return response.message ?? "Research queued. Result will appear in chat.";
	return response.content?.trim() || response.message || "No result.";
}
