import { describe, expect, it } from "vitest";
import { buildTree, filterTree, flattenVisibleTree, moveInArray } from "./page-tree-utils";

const pages = [
	{ spaceId: "space_1", pageId: "root", title: "Root", parentPageIds: [], createdAtMs: 1, updatedAtMs: 1 },
	{ spaceId: "space_1", pageId: "child", title: "Project notes", parentPageIds: ["root"], createdAtMs: 2, updatedAtMs: 2 },
	{ spaceId: "space_1", pageId: "peer", title: "Archive", parentPageIds: [], createdAtMs: 3, updatedAtMs: 3 },
];

describe("page tree utils", () => {
	it("builds a nested tree from parent ids", () => {
		const tree = buildTree(pages);
		expect(tree).toHaveLength(2);
		expect(tree[0]?.page.pageId).toBe("root");
		expect(tree[0]?.children[0]?.page.pageId).toBe("child");
	});

	it("filters while keeping matching descendants visible", () => {
		const filtered = filterTree(buildTree(pages), "project");
		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.page.pageId).toBe("root");
		expect(filtered[0]?.children[0]?.page.pageId).toBe("child");
	});

	it("flattens only expanded branches", () => {
		const flat = flattenVisibleTree(buildTree(pages), { root: false }, false);
		expect(flat.map((node) => node.id)).toEqual(["root", "peer"]);
	});

	it("reorders arrays without mutating the input", () => {
		const original = ["a", "b", "c"];
		expect(moveInArray(original, 0, 2)).toEqual(["b", "c", "a"]);
		expect(original).toEqual(["a", "b", "c"]);
	});
});
