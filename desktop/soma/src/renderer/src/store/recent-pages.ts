import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const MAX_RECENT = 10;
const STORAGE_KEY = "soma:recent-pages";

type RecentPage = {
	spaceId: string;
	pageId: string;
	title: string;
	openedAt: number;
};

type RecentPagesState = {
	entries: RecentPage[];
};

function loadFromStorage(): RecentPage[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item): item is RecentPage =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as Record<string, unknown>).spaceId === "string" &&
				typeof (item as Record<string, unknown>).pageId === "string" &&
				typeof (item as Record<string, unknown>).title === "string" &&
				typeof (item as Record<string, unknown>).openedAt === "number",
		);
	} catch {
		return [];
	}
}

function saveToStorage(entries: RecentPage[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// localStorage unavailable or quota exceeded — silently skip.
	}
}

const initialState: RecentPagesState = {
	entries: loadFromStorage(),
};

const recentPagesSlice = createSlice({
	name: "recentPages",
	initialState,
	reducers: {
		recordPageOpened(
			state,
			action: PayloadAction<{
				spaceId: string;
				pageId: string;
				title: string;
				openedAt: number;
			}>,
		) {
			const { spaceId, pageId, title, openedAt } = action.payload;
			// Remove existing entry for this (spaceId, pageId) if present so the
			// reopen promotes it to the head of the list (dedupe semantics).
			const filtered = state.entries.filter(
				(e) => !(e.spaceId === spaceId && e.pageId === pageId),
			);
			// Prepend the new entry and cap at MAX_RECENT. The reducer-side
			// invariant is "entries are newest-first", so slicing keeps the
			// newest and drops the oldest tail entry on overflow.
			state.entries = [
				{ spaceId, pageId, title, openedAt },
				...filtered,
			].slice(0, MAX_RECENT);
		},
	},
});

const recentPagesReducer = recentPagesSlice.reducer;
const recentPagesActions = recentPagesSlice.actions;

// Returns the raw entries array. The reducer already maintains
// newest-first order via prepending, so no sort is needed here.
// Returning the slice reference directly keeps `useAppSelector`
// stable across unrelated store updates.
function selectRecentPages(state: { recentPages: RecentPagesState }): RecentPage[] {
	return state.recentPages.entries;
}

export {
	MAX_RECENT,
	recentPagesActions,
	recentPagesReducer,
	saveToStorage,
	selectRecentPages,
	STORAGE_KEY,
};
export type { RecentPage, RecentPagesState };
