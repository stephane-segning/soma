/**
 * createNodeAIRegistry — in-memory implementation of {@link NodeAIRegistry}.
 *
 * Wave 1 ships this so Wave 2 components and stories can target the
 * real interface without waiting on the TipTap wiring in Wave 4
 * (see [scaffold §3 Wave 4](../../../../../docs/src/architecture/prd/ui-revamp-v0-scaffold.md#wave-4--logic--glue)).
 *
 * Stable iteration order: actions resolve in insertion order, grouped
 * by the locked category sequence — Rewrite → Modify → Tone →
 * Transform → Translate → Node → Custom.
 */
import type {
	NodeAIAction,
	NodeAIActionCategory,
	NodeAIActionSurface,
	NodeAIRegistry,
} from "./node-ai-registry.types";

const CATEGORY_ORDER: NodeAIActionCategory[] = [
	"rewrite",
	"modify",
	"tone",
	"transform",
	"translate",
	"node",
	"custom",
];

const DEFAULT_SURFACES: NodeAIActionSurface[] = ["selection"];

export function createNodeAIRegistry(): NodeAIRegistry {
	// Keyed by node type → Map<action.id, action> so re-registration
	// overwrites in place. Map preserves insertion order, which we
	// honour inside each category.
	const byNode = new Map<string, Map<string, NodeAIAction>>();

	function getNode(nodeType: string): Map<string, NodeAIAction> {
		let bucket = byNode.get(nodeType);
		if (!bucket) {
			bucket = new Map();
			byNode.set(nodeType, bucket);
		}
		return bucket;
	}

	return {
		register(nodeType, action) {
			getNode(nodeType).set(action.id, action);
		},
		unregister(nodeType, actionId) {
			byNode.get(nodeType)?.delete(actionId);
		},
		resolve(nodeType, surface) {
			const bucket = byNode.get(nodeType);
			if (!bucket) return [];
			const visible: NodeAIAction[] = [];
			for (const action of bucket.values()) {
				const surfaces = action.surfaces ?? DEFAULT_SURFACES;
				if (surfaces.includes(surface)) visible.push(action);
			}
			// Sort by category order, preserving insertion order inside each.
			// Unknown categories (would only happen if the type system is
			// bypassed at runtime) sink to the bottom instead of floating
			// to the top via `indexOf`'s -1.
			visible.sort((a, b) => {
				const ai = CATEGORY_ORDER.indexOf(a.category);
				const bi = CATEGORY_ORDER.indexOf(b.category);
				const aOrder = ai === -1 ? Number.POSITIVE_INFINITY : ai;
				const bOrder = bi === -1 ? Number.POSITIVE_INFINITY : bi;
				return aOrder - bOrder;
			});
			return visible;
		},
	};
}
