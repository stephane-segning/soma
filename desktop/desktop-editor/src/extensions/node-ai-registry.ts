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
 *  - normalizes TipTap's camelCase node names (`codeBlock`,
 *    `bulletList`) to the kebab-case spelling registries use
 *    (`code-block`, `bullet-list`)
 *
 * One editor command:
 *
 *  - `editor.commands.dispatchAIAction(id)` — resolves the current
 *    {@link NodeAIContext} and fires `action.run(ctx)` for the
 *    matching action. Returns `false` if no action is registered.
 *
 * Storage helpers (read in React render code on selection change):
 *
 *  - `editor.storage.nodeAIRegistry.resolveContext()` — the current
 *    {@link NodeAIContext} or `null`.
 *  - `editor.storage.nodeAIRegistry.resolveActions(surface?)` — the
 *    actions visible for the current node type + surface (defaults
 *    to the auto-resolved surface).
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
	/**
	 * The registry the extension dispatches against. The extension
	 * tolerates `null` (no-op dispatch + empty resolve) so it can be
	 * mounted before the renderer wires the production registry —
	 * useful for SSR/Storybook bootstrap.
	 */
	registry: NodeAIRegistry | null;
	/**
	 * Reports rejections from async `NodeAIAction.run` returns. Without
	 * a handler we log to the console — preferable to letting the
	 * unhandled promise propagate. Set this to wire into the host's
	 * error surface (toast, status bar, logger).
	 */
	onActionError?: (error: unknown, action: NodeAIAction) => void;
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
			 * Returns `false` if no registry is configured or no matching
			 * action is registered for the current surface + node type.
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
			// Default to a no-op shape so consumers who mount the extension
			// before configuring it (e.g. SSR bootstrap, test scaffolding)
			// don't crash. Production callers wire the real registry via
			// `.configure({ registry })`.
			return {
				registry: null,
				onActionError: undefined,
			};
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
			// Storage holds stable function references; the closures
			// re-read `this.options.registry` on each call so that if the
			// host swaps the registry (rare but legal) via `editor
			// .extensionManager.extensions[N].options.registry = …`, the
			// next call sees the new value.
			const extension = this;
			this.storage.resolveContext = () => resolveContext(extension.editor);
			this.storage.resolveActions = (surface?: NodeAIActionSurface) => {
				const registry = extension.options.registry;
				if (!registry) return [];
				const ctx = resolveContext(extension.editor);
				if (!ctx) return [];
				return registry.resolve(ctx.nodeType, surface ?? ctx.surface);
			};
		},

		addCommands() {
			return {
				dispatchAIAction:
					(actionId: string) =>
					({ editor }) => {
						const registry = this.options.registry;
						if (!registry) return false;
						const ctx = resolveContext(editor);
						if (!ctx) return false;
						const actions = registry.resolve(ctx.nodeType, ctx.surface);
						const action = actions.find((a) => a.id === actionId);
						if (!action) return false;
						runActionSafely(
							action,
							ctx,
							this.options.onActionError,
						);
						// TipTap commands return synchronously. Async errors
						// route through `onActionError`; the command itself
						// reports success-as-dispatched, not success-as-
						// completed.
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
 * `nodeType` is the closest ancestor block / node-selection type,
 * normalized via {@link normalizeNodeName} to match the kebab-case
 * spelling registries use (`codeBlock` → `code-block`).
 *
 * For range selections that cross multiple block types (e.g. from a
 * paragraph into a code block), `nodeType` reflects the first block
 * (`$from.parent`) and the metadata flag `mixedBlocks: true` indicates
 * the selection spans heterogeneous blocks — consumers can filter
 * actions that don't make sense for mixed content.
 */
function resolveContext(
	editor: import("@tiptap/core").Editor,
): NodeAIContext | null {
	if (!editor) return null;
	const { state } = editor;
	const { selection } = state;
	const { $from, $to } = selection;

	const isEmpty = selection.empty;
	// A NodeSelection (block selection) has a `node` property; range
	// selections don't. We deliberately don't import NodeSelection to
	// avoid pulling in the runtime class — duck-typing the field is
	// enough.
	const selectedNode: ProseMirrorNode | undefined = (
		selection as unknown as { node?: ProseMirrorNode }
	).node;

	let surface: NodeAIActionSurface;
	let rawNodeType: string;
	let text: string;
	let mixedBlocks = false;

	if (selectedNode) {
		surface = "node";
		rawNodeType = selectedNode.type.name;
		text = selectedNode.textContent;
	} else if (isEmpty) {
		surface = "caret";
		const block = $from.parent;
		rawNodeType = block.type.name;
		text = block.textContent;
	} else {
		surface = "selection";
		const block = $from.parent;
		rawNodeType = block.type.name;
		text = state.doc.textBetween(selection.from, selection.to, " ");
		mixedBlocks = $from.parent.type.name !== $to.parent.type.name;
	}

	return {
		nodeType: normalizeNodeName(rawNodeType),
		text,
		surface,
		metadata: {
			from: selection.from,
			to: selection.to,
			rawNodeType,
			mixedBlocks,
		},
	};
}

/**
 * TipTap exposes node names in camelCase (`codeBlock`, `bulletList`,
 * `taskList`, `horizontalRule`), but the {@link NodeAIRegistry}
 * contract — and the existing stories in `@soma/ui` — register actions
 * under kebab-case (`code-block`, `bullet-list`, `task-list`,
 * `horizontal-rule`). Normalize here so the same registry entry resolves
 * from both story mocks and the real editor.
 */
export function normalizeNodeName(name: string): string {
	return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
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

function runActionSafely(
	action: NodeAIAction,
	ctx: NodeAIContext,
	onError?: NodeAIRegistryExtensionOptions["onActionError"],
): void {
	try {
		const result = action.run(ctx);
		// `NodeAIAction.run` is typed as `void | Promise<void>` — async
		// rejections would otherwise become unhandled promise warnings.
		// Catch them and route to the consumer's error handler so the
		// host (toast / status bar / logger) can surface the failure.
		if (result && typeof (result as Promise<unknown>).then === "function") {
			(result as Promise<void>).catch((error: unknown) => {
				if (onError) onError(error, action);
				else console.error("[nodeAIRegistry] action failed", action.id, error);
			});
		}
	} catch (error) {
		if (onError) onError(error, action);
		else console.error("[nodeAIRegistry] action threw", action.id, error);
	}
}
