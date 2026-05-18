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
	/**
	 * Called when the registry catches an error — runtime fault in the
	 * dispatch callback, missing response content for an action that
	 * needs to mutate the doc, etc. Default is `console.error`.
	 */
	onError?: (error: unknown, action: NodeAIAction) => void;
};

export function createDefaultAIRegistry({
	editor,
	onQuickAction,
	onError,
}: AIRegistryFactoryInput): NodeAIRegistry {
	const registry = createNodeAIRegistry();
	if (!onQuickAction) return registry;

	function dispatchAndInsert(
		action: "explain" | "expand",
		ctx: { text: string; metadata?: Record<string, unknown> },
	): Promise<void> {
		return Promise.resolve(
			onQuickAction!({ action, selectionText: ctx.text }),
		).then((response) => {
			if (response.status !== "done" || !response.content?.trim()) return;
			const from = (ctx.metadata?.from as number | undefined) ?? null;
			const to = (ctx.metadata?.to as number | undefined) ?? null;
			if (from === null || to === null) return;
			editor
				.chain()
				.focus()
				.insertContentAt({ from, to }, response.content.trim())
				.run();
		});
	}

	const actions: NodeAIAction[] = [
		{
			id: "explain",
			label: "Explain",
			description: "Replace the selection with a plain-language explanation.",
			category: "rewrite",
			surfaces: ["selection"],
			run: (ctx) => dispatchAndInsert("explain", ctx),
		},
		{
			id: "expand",
			label: "Expand",
			description: "Continue the selection with additional detail.",
			category: "transform",
			surfaces: ["selection"],
			run: (ctx) => dispatchAndInsert("expand", ctx),
		},
		{
			id: "research",
			label: "Research",
			description: "Queue a research task. Result lands in chat.",
			category: "custom",
			surfaces: ["selection"],
			run: async (ctx) => {
				try {
					await onQuickAction!({ action: "research", selectionText: ctx.text });
				} catch (error) {
					if (onError) {
						onError(error, actions.find((a) => a.id === "research")!);
					}
				}
			},
		},
	];

	for (const nodeType of TEXT_BEARING_NODES) {
		for (const action of actions) registry.register(nodeType, action);
	}
	return registry;
}
