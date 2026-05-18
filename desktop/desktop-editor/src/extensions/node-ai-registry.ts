/**
 * NodeAIRegistry TipTap extension — Wave 4 of the UI revamp.
 *
 * The {@link NodeAIRegistry} interface and an in-memory implementation
 * ship from `@soma/ui/components/editor/node-ai-registry`. This file
 * provides the **TipTap glue** that turns editor state into a
 * {@link NodeAIContext} the registry can run against:
 *
 *  - resolves the surface (`selection` / `caret` / `node`) from the
 *    current editor selection
 *  - extracts the selected text or the current block's text content
 *  - identifies the active node type (paragraph, code-block, image, …)
 *
 * Three editor commands are added:
 *
 *  - `editor.commands.dispatchAIAction(id)` — fires an action against
 *    the auto-resolved surface.
 *  - `editor.commands.resolveAIActions(surface?)` — returns the actions
 *    visible at the caret/selection (used by SlashMenu, SelectionAIBar,
 *    and the right-click block menu).
 *  - `editor.commands.previewAIContext()` — for debugging; returns the
 *    {@link NodeAIContext} that would be passed to `action.run`.
 *
 * The extension is **storage-backed** so consumers can read the
 * resolved actions in render callbacks (`useEditor` re-renders on
 * selection change; storage stays stable across renders).
 *
 * Locked by [ADR-0005 §13](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and [refs editor-ai §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor-ai.md).
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
	NodeAIAction,
	NodeAIActionSurface,
	NodeAIContext,
	NodeAIRegistry,
} from "@soma/ui/components/editor/node-ai-registry.types";

export type NodeAIRegistryExtensionOptions = {
	/** The registry the extension dispatches against. */
	registry: NodeAIRegistry;
};

export type NodeAIRegistryStorage = {
	resolveContext: () => NodeAIContext | null;
	resolveActions: (surface?: NodeAIActionSurface) => NodeAIAction[];
};

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		nodeAIRegistry: {
			/**
			 * Resolve the current {@link NodeAIContext} from the editor
			 * selection and dispatch the named action's `run` against it.
			 * Returns `false` if the action is not registered for the
			 * current surface + node type.
			 */
			dispatchAIAction: (actionId: string) => ReturnType;
		};
	}

	interface Storage {
		nodeAIRegistry: NodeAIRegistryStorage;
	}
}

export const NodeAIRegistryExtension =
	Extension.create<NodeAIRegistryExtensionOptions>({
		name: "nodeAIRegistry",

		addOptions() {
			// `addOptions` runs before the extension is configured;
			// the real registry is provided by the caller via `.configure({ registry })`.
			// We cannot return a working default here, so consumers MUST configure.
			return undefined as unknown as NodeAIRegistryExtensionOptions;
		},

		addStorage() {
			return {
				resolveContext: (): NodeAIContext | null => null,
				resolveActions: (
					_surface?: NodeAIActionSurface,
				): NodeAIAction[] => [],
			};
		},

		onCreate() {
			// Wire the storage helpers once the editor exists. Storage holds
			// stable function references; the closures read `this.editor` and
			// `this.options.registry` at call time, so they see live state.
			const editor = this.editor;
			const registry = this.options.registry;
			this.storage.resolveContext = () => resolveContext(editor);
			this.storage.resolveActions = (surface?: NodeAIActionSurface) => {
				const ctx = resolveContext(editor);
				if (!ctx) return [];
				return registry.resolve(ctx.nodeType, surface ?? ctx.surface);
			};
		},

		addCommands() {
			return {
				dispatchAIAction:
					(actionId: string) =>
					({ editor }) => {
						const ctx = resolveContext(editor);
						if (!ctx) return false;
						const actions = this.options.registry.resolve(
							ctx.nodeType,
							ctx.surface,
						);
						const action = actions.find((a) => a.id === actionId);
						if (!action) return false;
						const result = action.run(ctx);
						// Treat `run` as fire-and-forget; if it returned a
						// promise, the consumer can await it via the registry
						// directly. TipTap commands return synchronously.
						void result;
						return true;
					},
			};
		},
	});

/**
 * Translate the current editor selection into a {@link NodeAIContext}.
 * Returns `null` only if no editor is attached.
 *
 * Surface derivation:
 *  - **`selection`** — the selection covers a non-empty range of text.
 *  - **`node`** — the selection is a NodeSelection (the user picked
 *    a whole block via the gutter handle or right-click).
 *  - **`caret`** — the selection is empty (just a caret position).
 *
 * `nodeType` is the closest ancestor block / node-selection type, NOT
 * the inline mark. For inline-only formats (bold, italic) the
 * `nodeType` falls back to the parent paragraph / heading.
 */
function resolveContext(
	editor: import("@tiptap/core").Editor,
): NodeAIContext | null {
	if (!editor) return null;
	const { state } = editor;
	const { selection } = state;
	const { $from } = selection;

	const isEmpty = selection.empty;
	// A NodeSelection (block selection) has a `node` property; range
	// selections don't. We deliberately don't import NodeSelection to
	// avoid pulling in the runtime class — duck-typing the field is
	// enough.
	const selectedNode: ProseMirrorNode | undefined = (
		selection as unknown as { node?: ProseMirrorNode }
	).node;

	let surface: NodeAIActionSurface;
	let nodeType: string;
	let text: string;

	if (selectedNode) {
		surface = "node";
		nodeType = selectedNode.type.name;
		text = selectedNode.textContent;
	} else if (isEmpty) {
		surface = "caret";
		const block = $from.parent;
		nodeType = block.type.name;
		text = block.textContent;
	} else {
		surface = "selection";
		const block = $from.parent;
		nodeType = block.type.name;
		text = state.doc.textBetween(selection.from, selection.to, " ");
	}

	return {
		nodeType,
		text,
		surface,
		metadata: {
			from: selection.from,
			to: selection.to,
		},
	};
}

/**
 * Convenience accessor for code that holds a TipTap editor reference
 * and wants the latest resolution without going through commands.
 * Returns `null` if the extension isn't installed.
 */
export function getNodeAIStorage(
	editor: import("@tiptap/core").Editor,
): NodeAIRegistryStorage | null {
	return editor.storage.nodeAIRegistry ?? null;
}
