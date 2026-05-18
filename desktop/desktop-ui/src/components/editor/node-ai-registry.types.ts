/**
 * NodeAIRegistry — types for the per-node-type AI action registry.
 *
 * Locked by [ADR-0005 §13](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and refs at
 * [refs editor-ai §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor-ai.md).
 *
 * This file contains **interfaces and types only** — the in-memory
 * registry implementation lives next to it in `node-ai-registry.ts`,
 * and the TipTap integration that wires it into editor commands lands
 * in Wave 4 (see
 * [scaffold Wave 4](../../../../../docs/src/architecture/prd/ui-revamp-v0-scaffold.md#wave-4--logic--glue)).
 *
 * Wave 2 components (`SlashMenu`, `SelectionAIBar`, the right-click
 * block menu) consume the {@link NodeAIRegistry} interface and accept
 * an injected registry — so they can be developed and storybooked
 * against the in-memory implementation without waiting for the TipTap
 * extension in Wave 4.
 */

/**
 * Identifies which surfaces should expose this action.
 *
 * - `selection` — the action is available when the user has selected
 *   text inside a block of this node type.
 * - `caret` — the action is available when the caret is in an empty
 *   position immediately after / inside a block of this node type.
 * - `node` — the action is available from the block's right-click
 *   menu (the `AI ▸` cluster).
 */
export type NodeAIActionSurface = "selection" | "caret" | "node";

/**
 * Categories shown as sectioning in the SelectionAIBar / SlashMenu AI
 * mode. Match the locked order from refs editor-ai §1 ("Synthesis:
 * SelectionAIBar component").
 */
export type NodeAIActionCategory =
	| "rewrite"
	| "modify"
	| "tone"
	| "transform"
	| "translate"
	| "node"
	| "custom";

/**
 * The execution context handed to {@link NodeAIAction.run} when the
 * user invokes the action.
 *
 * The shape is deliberately minimal at v0 — the TipTap integration
 * (Wave 4) will extend it with editor + selection handles. UI-only
 * tests (Wave 2 storybook stories, mock harnesses) get the in-memory
 * subset.
 */
export type NodeAIContext = {
	/** TipTap node type name — e.g. "paragraph", "code-block", "image". */
	nodeType: string;
	/**
	 * The currently selected text (or the block's text content for
	 * `caret` / `node` surfaces). Empty string when there is no text.
	 */
	text: string;
	/** Surface that invoked the action. */
	surface: NodeAIActionSurface;
	/** Per-node-type metadata. Free-form on purpose at v0. */
	metadata?: Record<string, unknown>;
};

/**
 * A single AI action that can be invoked against a node.
 *
 * Translation/i18n: `label` and `description` are caller-supplied
 * strings — they should already be localized when registered.
 * Components consuming the registry render them verbatim. The action
 * registration is itself a place where the i18n harness applies (see
 * [scaffold acceptance §4.7](../../../../../docs/src/architecture/prd/ui-revamp-v0-scaffold.md#4-acceptance-criteria--when-is-a-component-done)).
 */
export type NodeAIAction = {
	/** Stable, machine-friendly id. Used for keying + analytics. */
	id: string;
	/** Localized display label (e.g. "Improve writing"). */
	label: string;
	/** Optional one-line localized description. */
	description?: string;
	/** Which categorical section the action belongs to in the picker. */
	category: NodeAIActionCategory;
	/** Surfaces where the action should appear. Defaults to `["selection"]`. */
	surfaces?: NodeAIActionSurface[];
	/**
	 * Optional keyboard shortcut hint shown next to the action label
	 * (e.g. "⌘J ⌘S"). Strings only — display, not binding registration.
	 */
	shortcut?: string;
	/**
	 * The action body. v0 returns void; future iterations will return
	 * a streaming token iterator that the InlineAIStream component
	 * consumes.
	 */
	run: (ctx: NodeAIContext) => void | Promise<void>;
};

/**
 * The injectable registry consumed by Wave 2 components. Implementations
 * are either in-memory (storybook + tests) or TipTap-backed (Wave 4).
 */
export type NodeAIRegistry = {
	/**
	 * Register an action for a given node type. The same action `id`
	 * registered twice for the same node type overwrites the previous
	 * entry.
	 */
	register: (nodeType: string, action: NodeAIAction) => void;
	/** Remove every action registered for the given `nodeType` + `id` pair. */
	unregister: (nodeType: string, actionId: string) => void;
	/**
	 * Resolve the actions visible on the named surface for the given
	 * node type. Results are stable order: insertion order, grouped by
	 * the categorical lock in [refs editor-ai §1](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor-ai.md#1-selection-based-ai-action).
	 */
	resolve: (nodeType: string, surface: NodeAIActionSurface) => NodeAIAction[];
};
