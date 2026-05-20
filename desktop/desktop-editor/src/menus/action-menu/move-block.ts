/**
 * Block movement helpers for the drag-handle action menu.
 *
 * These swap adjacent siblings inside the same parent — a top-level
 * paragraph moves past the previous/next top-level block, a list item
 * moves past its previous/next sibling list item, etc. Boundaries are
 * a no-op (first child can't move up; last can't move down). Moving
 * across parent boundaries — lifting a list item out into a paragraph,
 * for instance — is outside the scope of this helper.
 *
 * `deleteBlock` removes the entire block by its starting position.
 *
 * **Schema-aware refusal.** Both helpers ask ProseMirror whether the
 * post-change child sequence is valid for the parent node type before
 * dispatching the transaction. This is what protects documents using
 * Soma's `CustomDocument` schema (`content: "heading block*"`) from
 * three classes of corruption:
 *
 *   - Moving a non-heading block above the required first heading
 *     (would put a paragraph at index 0; ProseMirror would "fit"
 *     the result by injecting an empty heading and demoting the
 *     original title).
 *   - Moving the heading itself down past the first body block (same
 *     symptom, mirror direction).
 *   - Deleting the required first heading (would leave an empty
 *     heading and silently discard the title text).
 *
 * In all three cases the helper now returns `false` and does nothing.
 *
 * **Position guard.** `pos` originates from transient UI state
 * (`activeNode.pos` in the action menu) and can become invalid
 * between the click and the dispatch — collaborative edits, fast
 * delete, etc. Both helpers bounds-check + try/catch `resolve` so a
 * stale position results in a no-op instead of a runtime exception.
 */
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

export function moveBlock(
	editor: Editor,
	pos: number,
	direction: "up" | "down",
): boolean {
	const { state } = editor;
	const docSize = state.doc.content.size;
	if (pos < 0 || pos >= docSize) return false;

	let $resolved: ReturnType<typeof state.doc.resolve>;
	try {
		$resolved = state.doc.resolve(pos);
	} catch {
		return false;
	}

	const index = $resolved.index();
	const parent = $resolved.parent;

	if (direction === "up") {
		if (index === 0) return false;
		const prev = parent.child(index - 1);
		const cur = parent.child(index);
		if (!canSwap(parent, index - 1, index, prev, cur)) return false;

		const prevStart = pos - prev.nodeSize;
		const curEnd = pos + cur.nodeSize;
		const tr = state.tr.replaceWith(prevStart, curEnd, [cur, prev]);
		editor.view.dispatch(tr.scrollIntoView());
		return true;
	}

	if (index >= parent.childCount - 1) return false;
	const cur = parent.child(index);
	const next = parent.child(index + 1);
	if (!canSwap(parent, index, index + 1, cur, next)) return false;

	const curStart = pos;
	const nextEnd = pos + cur.nodeSize + next.nodeSize;
	const tr = state.tr.replaceWith(curStart, nextEnd, [next, cur]);
	editor.view.dispatch(tr.scrollIntoView());
	return true;
}

export function deleteBlock(editor: Editor, pos: number): boolean {
	// ProseMirror's `nodeAt` throws RangeError on out-of-range positions
	// rather than returning null. Bounds-check + try/catch so the action
	// menu can pass an arbitrary `activeNode.pos` without worrying about
	// races between the doc shrinking and the click event firing.
	const docSize = editor.state.doc.content.size;
	if (pos < 0 || pos >= docSize) return false;

	let $resolved: ReturnType<typeof editor.state.doc.resolve>;
	try {
		$resolved = editor.state.doc.resolve(pos);
	} catch {
		return false;
	}

	const node = editor.state.doc.nodeAt(pos);
	if (!node) return false;

	const parent = $resolved.parent;
	const index = $resolved.index();
	const remaining: PMNode[] = [];
	parent.content.forEach((child, _offset, i) => {
		if (i !== index) remaining.push(child);
	});
	if (!parent.type.validContent(Fragment.from(remaining))) return false;

	const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
	editor.view.dispatch(tr);
	return true;
}

/**
 * Build the post-swap child fragment for `parent` (with `parent.child(a)` and
 * `parent.child(b)` exchanged) and ask the parent's node type whether that
 * sequence still matches the type's content expression. Returns true iff the
 * swap is legal under the schema. `a` and `b` are 0-based child indices and
 * must satisfy `a < b`.
 */
function canSwap(
	parent: PMNode,
	a: number,
	b: number,
	nodeA: PMNode,
	nodeB: PMNode,
): boolean {
	const swapped: PMNode[] = [];
	parent.content.forEach((child, _offset, i) => {
		if (i === a) swapped.push(nodeB);
		else if (i === b) swapped.push(nodeA);
		else swapped.push(child);
	});
	return parent.type.validContent(Fragment.from(swapped));
}
