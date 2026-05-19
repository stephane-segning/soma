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
			recordPageOpened({
				spaceId: "s1",
				pageId: "p1",
				title: "Page 1",
				openedAt: 1000,
			}),
		);
		expect(next.entries).toHaveLength(1);
		expect(next.entries[0]).toEqual({
			spaceId: "s1",
			pageId: "p1",
			title: "Page 1",
			openedAt: 1000,
		});
	});

	it("promotes an existing entry to the top on reopen (dedupe)", () => {
		// Stored newest-first by invariant: p2 is newer than p1.
		const initial = makeState([
			{ spaceId: "s1", pageId: "p2", title: "Page 2", openedAt: 200 },
			{ spaceId: "s1", pageId: "p1", title: "Page 1", openedAt: 100 },
		]);
		const next = recentPagesReducer(
			initial,
			recordPageOpened({
				spaceId: "s1",
				pageId: "p1",
				title: "Page 1 updated",
				openedAt: 300,
			}),
		);
		expect(next.entries).toHaveLength(2);
		expect(next.entries[0].pageId).toBe("p1");
		expect(next.entries[0].title).toBe("Page 1 updated");
		expect(next.entries[0].openedAt).toBe(300);
		expect(next.entries[1].pageId).toBe("p2");
	});

	it("caps at MAX_RECENT entries, evicting the oldest entry", () => {
		// The reducer invariant is "entries are newest-first": index 0 is
		// the most recently opened, the tail is the oldest. Seed the state
		// in that order — pNewest at the head, pOldest at the tail.
		const entries = Array.from({ length: MAX_RECENT }, (_, i) => ({
			spaceId: "s1",
			pageId: `p${i}`,
			title: `Page ${i}`,
			// i=0 is newest (head), i=9 is oldest (tail).
			openedAt: (MAX_RECENT - i) * 100,
		}));
		const initial = makeState(entries);
		const next = recentPagesReducer(
			initial,
			recordPageOpened({
				spaceId: "s1",
				pageId: "pNew",
				title: "New page",
				openedAt: Date.now(),
			}),
		);
		expect(next.entries).toHaveLength(MAX_RECENT);
		// The new entry is at the head.
		expect(next.entries[0].pageId).toBe("pNew");
		// The oldest entry (p9, the previous tail) is evicted.
		expect(next.entries.some((e) => e.pageId === "p9")).toBe(false);
		// The previous newest (p0) is still present and shifted by one.
		expect(next.entries[1].pageId).toBe("p0");
	});

	it("treats (spaceId, pageId) pairs independently across spaces", () => {
		const initial = makeState([
			{ spaceId: "s1", pageId: "p1", title: "S1 Page", openedAt: 100 },
		]);
		const next = recentPagesReducer(
			initial,
			recordPageOpened({
				spaceId: "s2",
				pageId: "p1",
				title: "S2 Page",
				openedAt: 200,
			}),
		);
		expect(next.entries).toHaveLength(2);
		expect(next.entries.some((e) => e.spaceId === "s1" && e.pageId === "p1")).toBe(true);
		expect(next.entries.some((e) => e.spaceId === "s2" && e.pageId === "p1")).toBe(true);
	});
});

describe("selectRecentPages", () => {
	it("returns entries as stored (already newest-first by reducer invariant)", () => {
		const stored = [
			{ spaceId: "s1", pageId: "p2", title: "Newest", openedAt: 300 },
			{ spaceId: "s1", pageId: "p3", title: "Middle", openedAt: 200 },
			{ spaceId: "s1", pageId: "p1", title: "Oldest", openedAt: 100 },
		];
		const state = { recentPages: makeState(stored) };
		const result = selectRecentPages(state);
		expect(result[0].pageId).toBe("p2");
		expect(result[1].pageId).toBe("p3");
		expect(result[2].pageId).toBe("p1");
	});

	it("returns a stable reference across calls (no defensive copy)", () => {
		// Reference stability matters: useAppSelector relies on === to skip
		// rerenders when nothing changed.
		const state = {
			recentPages: makeState([
				{ spaceId: "s1", pageId: "p1", title: "Page 1", openedAt: 100 },
			]),
		};
		expect(selectRecentPages(state)).toBe(selectRecentPages(state));
	});

	it("returns empty array for empty state", () => {
		expect(selectRecentPages({ recentPages: makeState([]) })).toEqual([]);
	});
});
