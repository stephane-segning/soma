/**
 * createDefaultAIRegistry — builds an in-memory NodeAIRegistry from
 * the legacy `onQuickAction` callback so the locked `SelectionAIBar`
 * surface has a usable catalog without forcing every host app to
 * re-implement the registry contract.
 *
 * Action catalog mirrors the pre-revamp quick-actions:
 *   - **explain** (rewrite category) — returns content; inserted in
 *     place of the selection.
 *   - **expand** (transform category) — returns content; inserted in
 *     place of the selection (same as the legacy "Expand" behavior).
 *   - **research** (custom category) — fires a background task and
 *     surfaces a status message. No editor mutation.
 *
 * Each action is registered for every block type that holds text in
 * the default extensions list. Registry can be reused / extended by
 * callers that need to layer custom actions on top.
 */
import type { Editor } from "@tiptap/react";
import { createNodeAIRegistry } from "@soma/ui/components/editor/node-ai-registry";
import type {
	NodeAIAction,
	NodeAIRegistry,
} from "@soma/ui/components/editor/node-ai-registry.types";
import type {
	QuickActionRequest,
	QuickActionResponse,
} from "./contextual-menu/types";

const TEXT_BEARING_NODES = [
	"paragraph",
	"heading",
	"blockquote",
	"bullet-list",
	"ordered-list",
	"task-list",
	"code-block",
] as const;

export type AIRegistryFactoryInput = {
	editor: Editor;
	onQuickAction?: (input: QuickActionRequest) => Promise<QuickActionResponse>;
};

export function createDefaultAIRegistry({
	editor,
	onQuickAction,
}: AIRegistryFactoryInput): NodeAIRegistry {
	const registry = createNodeAIRegistry();
	if (!onQuickAction) return registry;

	async function dispatchAndInsert(
		action: "explain" | "expand",
		ctx: { text: string; metadata?: Record<string, unknown> },
	): Promise<void> {
		const response = await onQuickAction!({
			action,
			selectionText: ctx.text,
		});
		if (response.status !== "done" || !response.content?.trim()) return;
		const from = (ctx.metadata?.from as number | undefined) ?? null;
		const to = (ctx.metadata?.to as number | undefined) ?? null;
		if (from === null || to === null) return;
		editor
			.chain()
			.focus()
			.insertContentAt({ from, to }, response.content.trim())
			.run();
	}

	const actions: NodeAIAction[] = [
		{
			id: "explain",
			label: "Explain",
			description: "Replace the selection with a plain-language explanation.",
			category: "rewrite",
			// Registered on both "selection" and "node" surfaces so that:
			//   - The BubbleMenu's SelectionAIBar (selection surface) sees the action.
			//   - The drag-handle AI button (node surface) also resolves it via
			//     NodeAIRegistryExtension, and SelectionAIBar's internal
			//     registry.resolve(nodeType, "selection") call still finds it.
			surfaces: ["selection", "node"],
			run: (ctx) => dispatchAndInsert("explain", ctx),
		},
		{
			id: "expand",
			label: "Expand",
			description: "Continue the selection with additional detail.",
			category: "transform",
			surfaces: ["selection", "node"],
			run: (ctx) => dispatchAndInsert("expand", ctx),
		},
		{
			id: "research",
			label: "Research",
			description: "Queue a research task. Result lands in chat.",
			category: "custom",
			surfaces: ["selection", "node"],
			// Rejections propagate to the NodeAIRegistryExtension's
			// `runActionSafely`, which routes them through `onActionError`
			// (and falls back to `console.error`). Swallowing here would
			// hide failures when the host doesn't configure `onError`.
			run: (ctx) =>
				onQuickAction!({ action: "research", selectionText: ctx.text }).then(
					() => undefined,
				),
		},
	];

	for (const nodeType of TEXT_BEARING_NODES) {
		for (const action of actions) registry.register(nodeType, action);
	}
	return registry;
}
