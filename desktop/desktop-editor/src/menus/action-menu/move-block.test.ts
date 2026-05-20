/**
 * Tests for the action-menu's block movement helpers. Covers the
 * "Move up", "Move down", and "Delete" actions wired into the drag-
 * handle popover.
 *
 * Two schemas are used:
 *   - A permissive `block+` schema for the basic swap/delete tests
 *     where the helpers only depend on positional math.
 *   - A heading-first schema (`heading block*`) mirroring the real
 *     Soma `CustomDocument`, used to verify the schema-aware guards
 *     refuse moves/deletes that would corrupt the structure.
 */
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { deleteBlock, moveBlock } from "./move-block";

const permissiveSchema = new Schema({
	nodes: {
		doc: { content: "block+" },
		paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0] },
		text: { group: "inline" },
	},
});

const headingFirstSchema = new Schema({
	nodes: {
		doc: { content: "heading block*" },
		paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0] },
		heading: { group: "block", content: "text*", toDOM: () => ["h1", 0] },
		text: { group: "inline" },
	},
});

type EditorHandle = { editor: Editor; getDoc: () => string[] };

function makeEditor(
	schema: Schema,
	blocks: Array<{ type: "paragraph" | "heading"; text: string }>,
): EditorHandle {
	const state = EditorState.create({
		schema,
		doc: schema.node(
			"doc",
			null,
			blocks.map((b) =>
				schema.node(b.type, null, b.text.length > 0 ? [schema.text(b.text)] : []),
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

function paragraphs(schema: Schema, texts: string[]): EditorHandle {
	return makeEditor(
		schema,
		texts.map((t) => ({ type: "paragraph" as const, text: t })),
	);
}

function blockStartPos(editor: Editor, index: number): number {
	let pos = 0;
	editor.state.doc.forEach((_node, offset, i) => {
		if (i === index) pos = offset;
	});
	return pos;
}

describe("moveBlock (permissive schema)", () => {
	it("swaps with the previous sibling when direction is 'up'", () => {
		const { editor, getDoc } = paragraphs(permissiveSchema, ["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 1), "up");
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["B", "A", "C"]);
	});

	it("swaps with the next sibling when direction is 'down'", () => {
		const { editor, getDoc } = paragraphs(permissiveSchema, ["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 1), "down");
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["A", "C", "B"]);
	});

	it("is a no-op at the top boundary", () => {
		const { editor, getDoc } = paragraphs(permissiveSchema, ["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 0), "up");
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["A", "B", "C"]);
	});

	it("is a no-op at the bottom boundary", () => {
		const { editor, getDoc } = paragraphs(permissiveSchema, ["A", "B", "C"]);
		const result = moveBlock(editor, blockStartPos(editor, 2), "down");
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["A", "B", "C"]);
	});

	it("returns false for an out-of-range position", () => {
		const { editor, getDoc } = paragraphs(permissiveSchema, ["A"]);
		expect(moveBlock(editor, 999, "up")).toBe(false);
		expect(moveBlock(editor, -1, "down")).toBe(false);
		expect(getDoc()).toEqual(["A"]);
	});
});

describe("moveBlock (heading-first schema)", () => {
	it("refuses to move the first body block above the required heading", () => {
		// doc: [heading "Title", paragraph "Body"]. Trying to move "Body"
		// up would place the paragraph at index 0; the schema requires
		// the first child to be a heading.
		const { editor, getDoc } = makeEditor(headingFirstSchema, [
			{ type: "heading", text: "Title" },
			{ type: "paragraph", text: "Body" },
		]);
		const result = moveBlock(editor, blockStartPos(editor, 1), "up");
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["Title", "Body"]);
	});

	it("refuses to move the title heading down past the first body block", () => {
		// Mirror of the case above — moving heading down would also put a
		// paragraph at index 0.
		const { editor, getDoc } = makeEditor(headingFirstSchema, [
			{ type: "heading", text: "Title" },
			{ type: "paragraph", text: "Body" },
		]);
		const result = moveBlock(editor, blockStartPos(editor, 0), "down");
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["Title", "Body"]);
	});

	it("allows moving body blocks among themselves below the heading", () => {
		const { editor, getDoc } = makeEditor(headingFirstSchema, [
			{ type: "heading", text: "Title" },
			{ type: "paragraph", text: "A" },
			{ type: "paragraph", text: "B" },
		]);
		const result = moveBlock(editor, blockStartPos(editor, 1), "down");
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["Title", "B", "A"]);
	});
});

describe("deleteBlock (permissive schema)", () => {
	it("removes the block at the given position", () => {
		const { editor, getDoc } = paragraphs(permissiveSchema, ["A", "B", "C"]);
		const result = deleteBlock(editor, blockStartPos(editor, 1));
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["A", "C"]);
	});

	it("returns false for an invalid position", () => {
		const { editor, getDoc } = paragraphs(permissiveSchema, ["A"]);
		const result = deleteBlock(editor, 999);
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["A"]);
	});

	it("does not invoke dispatch on invalid position", () => {
		const { editor } = paragraphs(permissiveSchema, ["A"]);
		const dispatchSpy = vi.spyOn(editor.view, "dispatch");
		deleteBlock(editor, 999);
		expect(dispatchSpy).not.toHaveBeenCalled();
	});
});

describe("deleteBlock (heading-first schema)", () => {
	it("refuses to delete the required first heading", () => {
		const { editor, getDoc } = makeEditor(headingFirstSchema, [
			{ type: "heading", text: "Title" },
			{ type: "paragraph", text: "Body" },
		]);
		const result = deleteBlock(editor, blockStartPos(editor, 0));
		expect(result).toBe(false);
		expect(getDoc()).toEqual(["Title", "Body"]);
	});

	it("allows deleting non-required body blocks", () => {
		const { editor, getDoc } = makeEditor(headingFirstSchema, [
			{ type: "heading", text: "Title" },
			{ type: "paragraph", text: "Body" },
		]);
		const result = deleteBlock(editor, blockStartPos(editor, 1));
		expect(result).toBe(true);
		expect(getDoc()).toEqual(["Title"]);
	});
});
