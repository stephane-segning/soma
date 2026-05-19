/**
 * Tests for the action-menu's block movement helpers. Covers the
 * "Move up", "Move down", and "Delete" actions wired into the drag-
 * handle popover.
 *
 * We run against a small synthetic ProseMirror schema rather than the
 * real Soma schema — the helpers only depend on `parent.child(index)`
 * positional math, so any schema with multiple top-level blocks works.
 */
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { deleteBlock, moveBlock } from "./move-block";

const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0] },
		text: { group: "inline" },
	},
});

function makeEditor(textBlocks: string[]): { editor: Editor; getDoc: () => string[] } {
	const state = EditorState.create({
		schema,
		doc: schema.node(
			"doc",
			null,
			textBlocks.map((t) =>
				schema.node("paragraph", null, t.length > 0 ? [schema.text(t)] : []),
			),
		),
	});
	let current = state;
	const editor = {
		get state() {
			return current;
		},
		view: {
			dispatch(tr: ReturnType<typeof current.tr.delete>) {
				current = current.apply(tr);
			},
		},
	} as unknown as Editor;
	return {
		editor,
		getDoc: () =>
			current.doc.content.content.map((node) => node.textContent),
	};
}

function blockStartPos(editor: Editor, index: number): number {
	let pos = 0;
	editor.state.doc.forEach((_node, offset, i) => {
		if (i === index) pos = offset;
	});
	return pos;
}

describe("moveBlock", () => {
	it("swaps with the previous sibling when direction is 'up'", () => {
		const { editor, getDoc } = makeEditor(["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 1), "up");
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["B", "A", "C"]);
	});

	it("swaps with the next sibling when direction is 'down'", () => {
		const { editor, getDoc } = makeEditor(["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 1), "down");
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["A", "C", "B"]);
	});

	it("is a no-op at the top boundary", () => {
		const { editor, getDoc } = makeEditor(["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 0), "up");
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["A", "B", "C"]);
	});

	it("is a no-op at the bottom boundary", () => {
		const { editor, getDoc } = makeEditor(["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 2), "down");
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["A", "B", "C"]);
	});
});

describe("deleteBlock", () => {
	it("removes the block at the given position", () => {
		const { editor, getDoc } = makeEditor(["A", "B", "C"]);
		const result = deleteBlock(editor, blockStartPos(editor, 1));
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["A", "C"]);
	});

	it("returns false for an invalid position", () => {
		const { editor, getDoc } = makeEditor(["A"]);
		const result = deleteBlock(editor, 999);
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["A"]);
	});

	it("does not invoke dispatch on invalid position", () => {
		const { editor } = makeEditor(["A"]);
		const dispatchSpy = vi.spyOn(editor.view, "dispatch");
		deleteBlock(editor, 999);
		expect(dispatchSpy).not.toHaveBeenCalled();
	});
});
