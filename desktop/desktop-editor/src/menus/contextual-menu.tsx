import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";
import { getRotateActionLabel, readCurrentBlockKind, rotateBlock } from "./block-rotation";
import { FormatToolbar } from "./contextual-menu/format-toolbar";
import { QuickActionPanel } from "./contextual-menu/quick-action-panel";
import { readSelection, type SelectionSnapshot } from "./contextual-menu/selection";
import type { QuickActionRequest, QuickActionResponse, QuickActionType } from "./contextual-menu/types";

export type { QuickActionRequest, QuickActionResponse, QuickActionType };

export function ContextualMenu({
	editor,
	onQuickAction,
}: {
	editor: Editor;
	onQuickAction?: (input: QuickActionRequest) => Promise<QuickActionResponse>;
}) {
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

	return (
		<>
			<BubbleMenu className="bubble-menu" editor={editor}>
				<FormatToolbar
					editor={editor}
					onQuickActions={onQuickAction ? openQuickActions : undefined}
					onRotate={() => rotateBlock(editor)}
					panelOpen={panelOpen}
					rotateLabel={getRotateActionLabel(readCurrentBlockKind(editor))}
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
