/**
 * Coverage for two behavior changes to the "+" add-menu:
 *
 *  1. The decorative placeholder blocks (`textRotate` / `carousel` /
 *     `accordion` — always inserted `placehold.co` demo content) are
 *     gone from the menu entirely, not just relabelled.
 *  2. "Page link" no longer inserts a hardcoded demo node
 *     (`page_demo_789`) — it now hands off to `onInsertPageLink`, the
 *     same shape as `onInsertImage` / `onInsertFile`, so the host app's
 *     real picker (`PageLinkPicker` in `@soma/desktop-app`) decides
 *     what gets inserted.
 */
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { createAddMenuItems } from "./add-menu-items";
import type { ActiveNode } from "./types";

const editor = {} as Editor;
const activeNode: ActiveNode = { pos: 3, insertPos: 5, blockKind: "paragraph" };

describe("createAddMenuItems", () => {
	it("no longer offers the retired decorative placeholder blocks", () => {
		const ids = createAddMenuItems({ activeNode, editor, insertAt: vi.fn() }).map((item) => item.id);
		expect(ids).not.toContain("add-text-rotate");
		expect(ids).not.toContain("add-carousel");
		expect(ids).not.toContain("add-accordion");
	});

	it("still inserts simple blocks synchronously via insertAt", () => {
		const insertAt = vi.fn();
		const items = createAddMenuItems({ activeNode, editor, insertAt });
		items.find((item) => item.id === "add-paragraph")?.onSelect?.();
		expect(insertAt).toHaveBeenCalledWith({ type: "paragraph" });
	});

	describe("add-page-link", () => {
		it("delegates to onInsertPageLink with the editor and insert position, instead of inserting a placeholder node", () => {
			const onInsertPageLink = vi.fn().mockResolvedValue(undefined);
			const items = createAddMenuItems({ activeNode, editor, insertAt: vi.fn(), onInsertPageLink });

			items.find((item) => item.id === "add-page-link")?.onSelect?.();

			expect(onInsertPageLink).toHaveBeenCalledWith(editor, activeNode.insertPos);
		});

		it("is a no-op when onInsertPageLink is not provided (mirrors onInsertImage/onInsertFile's undefined-safe pattern)", () => {
			const items = createAddMenuItems({ activeNode, editor, insertAt: vi.fn() });
			expect(() => items.find((item) => item.id === "add-page-link")?.onSelect?.()).not.toThrow();
		});
	});
});
