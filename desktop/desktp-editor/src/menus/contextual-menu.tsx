import { cn } from "@soma/ui/utils/cn";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Bold, Italic, Minus, Zap } from "react-feather";

export type QuickActionType = "explain" | "expand" | "research";

export type QuickActionRequest = {
	action: QuickActionType;
	selectionText: string;
};

export type QuickActionResponse = {
	status: "done" | "queued";
	content?: string;
	message?: string;
};

type SelectionSnapshot = {
	text: string;
	range: {
		from: number;
		to: number;
	};
};

function readSelection(editor: Editor): SelectionSnapshot | null {
	const { from, to, empty } = editor.state.selection;
	if (empty || from === to) return null;
	const text = editor.state.doc.textBetween(from, to, "\n", "\n").trim();
	if (!text) return null;
	return {
		text,
		range: { from, to },
	};
}

export function ContextualMenu({
	editor,
	onQuickAction,
}: {
	editor: Editor;
	onQuickAction?: (input: QuickActionRequest) => Promise<QuickActionResponse>;
}) {
	const [modalOpen, setModalOpen] = useState(false);
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
		setModalOpen(true);
	}, [editor]);

	const runQuickAction = useCallback(
		async (action: QuickActionType) => {
			if (!onQuickAction || !selection || runningAction) return;
			setRunningAction(action);
			setResultText("");
			setResultTone("default");
			try {
				const response = await onQuickAction({
					action,
					selectionText: selection.text,
				});

				if (action === "expand" && response.status === "done" && response.content?.trim()) {
					editor
						.chain()
						.focus()
						.insertContentAt(selection.range, response.content.trim())
						.run();
				}

				if (action === "research") {
					setResultText(response.message ?? "Research queued. Result will appear in chat.");
					setModalOpen(false);
					return;
				}

				setResultText(response.content?.trim() || response.message || "No result.");
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
				<div className="join">
					<button
						type="button"
						onClick={() => editor.chain().focus().toggleBold().run()}
						className={cn(
							"join-item btn btn-soft btn-sm btn-circle",
							editor.isActive("bold") && "is-active",
						)}
					>
						<Bold className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => editor.chain().focus().toggleItalic().run()}
						className={cn(
							"join-item btn btn-soft btn-sm btn-circle",
							editor.isActive("italic") && "is-active",
						)}
					>
						<Italic className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => editor.chain().focus().toggleStrike().run()}
						className={cn(
							"join-item btn btn-soft btn-sm btn-circle",
							editor.isActive("strike") && "is-active",
						)}
					>
						<Minus className="size-4" />
					</button>
					{onQuickAction ? (
						<button
							type="button"
							onMouseDown={(event) => {
								event.preventDefault();
								event.stopPropagation();
								openQuickActions();
							}}
							className="join-item btn btn-soft btn-sm btn-circle"
							title="Quick actions"
						>
							<Zap className="size-4" />
						</button>
					) : null}
				</div>
			</BubbleMenu>

			<AnimatePresence>
				{modalOpen && selection ? (
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-50 bg-black/35"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onMouseDown={() => setModalOpen(false)}
						transition={{ duration: 0.15 }}
					>
						<motion.div
							animate={{ opacity: 1, y: 0, scale: 1 }}
							className="absolute top-1/2 left-1/2 w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-2xl"
							exit={{ opacity: 0, y: 10, scale: 0.98 }}
							initial={{ opacity: 0, y: 16, scale: 0.98 }}
							onMouseDown={(event) => event.stopPropagation()}
							transition={{ duration: 0.16 }}
						>
							<div className="mb-3">
								<div className="font-semibold text-base">Selection Actions</div>
								<div className="mt-1 line-clamp-4 rounded-lg bg-base-200 px-3 py-2 text-base-content/80 text-sm">
									{selection.text}
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-3">
								<button
									type="button"
									className="btn btn-sm"
									disabled={runningAction !== null}
									onClick={() => void runQuickAction("explain")}
								>
									{runningAction === "explain" ? "Explaining…" : "Explain"}
								</button>
								<button
									type="button"
									className="btn btn-sm btn-primary"
									disabled={runningAction !== null}
									onClick={() => void runQuickAction("expand")}
								>
									{runningAction === "expand" ? "Expanding…" : "Expand"}
								</button>
								<button
									type="button"
									className="btn btn-sm btn-secondary"
									disabled={runningAction !== null}
									onClick={() => void runQuickAction("research")}
								>
									{runningAction === "research" ? "Queueing…" : "Research"}
								</button>
							</div>

							{resultText ? (
								<div
									className={cn(
										"mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm",
										resultTone === "error"
											? "border-error/50 bg-error/10 text-error-content"
											: "border-base-300 bg-base-200",
									)}
								>
									{resultText}
								</div>
							) : null}

							<div className="mt-3 flex justify-end">
								<button className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)} type="button">
									Close
								</button>
							</div>
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</>
	);
}
