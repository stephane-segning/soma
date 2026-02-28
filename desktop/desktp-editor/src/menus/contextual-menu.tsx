import { cn } from "@soma/ui/utils/cn";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Bold, HelpCircle, Italic, Maximize2, Minus, RefreshCw, Search, Zap } from "react-feather";
import { getRotateActionLabel, readCurrentBlockKind, rotateBlock } from "./block-rotation";

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
	anchor: {
		x: number;
		y: number;
	};
};

function readSelection(editor: Editor): SelectionSnapshot | null {
	const { from, to, empty } = editor.state.selection;
	if (empty || from === to) return null;
	const text = editor.state.doc.textBetween(from, to, "\n", "\n").trim();
	if (!text) return null;

	const fromCoords = editor.view.coordsAtPos(from);
	const toCoords = editor.view.coordsAtPos(to);
	const centerX = (fromCoords.left + toCoords.right) / 2;
	const anchorY = Math.max(fromCoords.bottom, toCoords.bottom) + 10;

	return {
		text,
		range: { from, to },
		anchor: { x: centerX, y: anchorY },
	};
}

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

	const handleRotateBlock = useCallback(() => {
		rotateBlock(editor);
	}, [editor]);

	const rotateLabel = getRotateActionLabel(readCurrentBlockKind(editor));

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
					<button
						type="button"
						onMouseDown={(event) => {
							event.preventDefault();
							event.stopPropagation();
							handleRotateBlock();
						}}
						className="join-item btn btn-soft btn-sm btn-circle"
						title={rotateLabel}
					>
						<RefreshCw className="size-4" />
					</button>
					{onQuickAction ? (
						<button
							type="button"
							onMouseDown={(event) => {
								event.preventDefault();
								event.stopPropagation();
								openQuickActions();
							}}
							className={cn(
								"join-item btn btn-soft btn-sm btn-circle",
								panelOpen && "btn-active",
							)}
							title="Quick actions"
						>
							<Zap className="size-4" />
						</button>
					) : null}
				</div>
			</BubbleMenu>

			<AnimatePresence>
				{panelOpen && selection ? (
					<motion.div
						animate={{ opacity: 1, y: 0, scale: 1 }}
						className="fixed z-50 w-[min(92vw,560px)] rounded-2xl border border-base-300 bg-base-100 p-4 shadow-2xl"
						exit={{ opacity: 0, y: 8, scale: 0.98 }}
						initial={{ opacity: 0, y: 12, scale: 0.98 }}
						style={{
							left: `clamp(16px, ${selection.anchor.x - 280}px, calc(100vw - 576px))`,
							top: `clamp(16px, ${selection.anchor.y}px, calc(100vh - 320px))`,
						}}
						transition={{ duration: 0.16 }}
					>
						<div className="line-clamp-4 rounded-lg bg-base-200 px-3 py-2 font-medium text-sm">
							{selection.text}
						</div>

						{!resultText ? (
							<ul className="mt-3 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300">
								<li>
									<button
										type="button"
										className={cn(
											"flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-base-200",
											runningAction !== null && "cursor-not-allowed opacity-60",
										)}
										disabled={runningAction !== null}
										onClick={() => void runQuickAction("explain")}
									>
										<span>{runningAction === "explain" ? "Explaining…" : "Explain selection"}</span>
										<HelpCircle className="size-4 text-base-content/70" />
									</button>
								</li>
								<li>
									<button
										type="button"
										className={cn(
											"flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-base-200",
											runningAction !== null && "cursor-not-allowed opacity-60",
										)}
										disabled={runningAction !== null}
										onClick={() => void runQuickAction("expand")}
									>
										<span>{runningAction === "expand" ? "Expanding…" : "Expand selection"}</span>
										<Maximize2 className="size-4 text-base-content/70" />
									</button>
								</li>
								<li>
									<button
										type="button"
										className={cn(
											"flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-base-200",
											runningAction !== null && "cursor-not-allowed opacity-60",
										)}
										disabled={runningAction !== null}
										onClick={() => void runQuickAction("research")}
									>
										<span>{runningAction === "research" ? "Researching…" : "Research selection"}</span>
										<Search className="size-4 text-base-content/70" />
									</button>
								</li>
							</ul>
						) : null}

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
					</motion.div>
				) : null}
			</AnimatePresence>
		</>
	);
}
