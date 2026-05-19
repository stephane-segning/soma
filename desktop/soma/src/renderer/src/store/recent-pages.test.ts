import { describe, expect, it } from "vitest";
import {
	MAX_RECENT,
	recentPagesActions,
	recentPagesReducer,
	selectRecentPages,
	type RecentPagesState,
} from "./recent-pages";

const { recordPageOpened } = recentPagesActions;

function makeState(entries: RecentPagesState["entries"]): RecentPagesState {
	return { entries };
}

describe("recentPagesReducer", () => {
	it("adds a new entry to an empty state", () => {
		const next = recentPagesReducer(
			makeState([]),
			recordPageOpened({ spaceId: "s1", pageId: "p1", title: "Page 1" }),
		);
		expect(next.entries).toHaveLength(1);
		expect(next.entries[0]).toMatchObject({ spaceId: "s1", pageId: "p1", title: "Page 1" });
	});

	it("promotes an existing entry to the top on reopen (dedupe)", () => {
		const initial = makeState([
			{ spaceId: "s1", pageId: "p1", title: "Page 1", openedAt: 100 },
			{ spaceId: "s1", pageId: "p2", title: "Page 2", openedAt: 200 },
		]);
		const next = recentPagesReducer(
			initial,
			recordPageOpened({ spaceId: "s1", pageId: "p1", title: "Page 1 updated" }),
		);
		expect(next.entries).toHaveLength(2);
		expect(next.entries[0].pageId).toBe("p1");
		expect(next.entries[0].title).toBe("Page 1 updated");
		expect(next.entries[1].pageId).toBe("p2");
	});

	it("caps at MAX_RECENT entries, evicting the tail entry", () => {
		// Build a state already at MAX_RECENT entries, stored in insertion order
		// (p0 = oldest by openedAt, p9 = most recent by openedAt).
		const entries = Array.from({ length: MAX_RECENT }, (_, i) => ({
			spaceId: "s1",
			pageId: `p${i}`,
			title: `Page ${i}`,
			openedAt: i * 100,
		}));
		const initial = makeState(entries);
		const next = recentPagesReducer(
			initial,
			recordPageOpened({ spaceId: "s1", pageId: "pNew", title: "New page" }),
		);
		expect(next.entries).toHaveLength(MAX_RECENT);
		expect(next.entries[0].pageId).toBe("pNew");
		// The tail of the stored array (p9) is dropped to maintain the cap.
		expect(next.entries.some((e) => e.pageId === "p9")).toBe(false);
		// The head (p0) should still be present.
		expect(next.entries.some((e) => e.pageId === "p0")).toBe(true);
	});

	it("treats (spaceId, pageId) pairs independently across spaces", () => {
		const initial = makeState([
			{ spaceId: "s1", pageId: "p1", title: "S1 Page", openedAt: 100 },
		]);
		const next = recentPagesReducer(
			initial,
			recordPageOpened({ spaceId: "s2", pageId: "p1", title: "S2 Page" }),
		);
		expect(next.entries).toHaveLength(2);
		expect(next.entries.some((e) => e.spaceId === "s1" && e.pageId === "p1")).toBe(true);
		expect(next.entries.some((e) => e.spaceId === "s2" && e.pageId === "p1")).toBe(true);
	});
});

describe("selectRecentPages", () => {
	it("returns entries sorted newest-first by openedAt", () => {
		const state = {
			recentPages: makeState([
				{ spaceId: "s1", pageId: "p1", title: "Oldest", openedAt: 100 },
				{ spaceId: "s1", pageId: "p2", title: "Newest", openedAt: 300 },
				{ spaceId: "s1", pageId: "p3", title: "Middle", openedAt: 200 },
			]),
		};
		const result = selectRecentPages(state);
		expect(result[0].pageId).toBe("p2");
		expect(result[1].pageId).toBe("p3");
		expect(result[2].pageId).toBe("p1");
	});

	it("returns empty array for empty state", () => {
		expect(selectRecentPages({ recentPages: makeState([]) })).toEqual([]);
	});
});
