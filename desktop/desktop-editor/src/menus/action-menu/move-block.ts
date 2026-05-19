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
 */
import type { Editor } from "@tiptap/react";

export function moveBlock(editor: Editor, pos: number, direction: "up" | "down"): boolean {
	const { state } = editor;
	const $resolved = state.doc.resolve(pos);
	const index = $resolved.index();
	const parent = $resolved.parent;

	if (direction === "up") {
		if (index === 0) return false;
		const prev = parent.child(index - 1);
		const cur = parent.child(index);
		const prevStart = pos - prev.nodeSize;
		const curEnd = pos + cur.nodeSize;
		const tr = state.tr.replaceWith(prevStart, curEnd, [cur, prev]);
		editor.view.dispatch(tr.scrollIntoView());
		return true;
	}

	if (index >= parent.childCount - 1) return false;
	const cur = parent.child(index);
	const next = parent.child(index + 1);
	const curStart = pos;
	const nextEnd = pos + cur.nodeSize + next.nodeSize;
	const tr = state.tr.replaceWith(curStart, nextEnd, [next, cur]);
	editor.view.dispatch(tr.scrollIntoView());
	return true;
}

export function deleteBlock(editor: Editor, pos: number): boolean {
	// ProseMirror's `nodeAt` throws RangeError on out-of-range positions
	// rather than returning null. We guard up-front so callers (the action
	// menu) can pass an arbitrary `activeNode.pos` without worrying about
	// races between the doc shrinking and the click event firing.
	const docSize = editor.state.doc.content.size;
	if (pos < 0 || pos >= docSize) return false;
	const node = editor.state.doc.nodeAt(pos);
	if (!node) return false;
	const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
	editor.view.dispatch(tr);
	return true;
}
