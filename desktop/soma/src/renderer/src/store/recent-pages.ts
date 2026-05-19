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
		// localStorage unavailable — silently skip
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
			}>,
		) {
			const { spaceId, pageId, title } = action.payload;
			// Remove existing entry for this (spaceId, pageId) if present
			const filtered = state.entries.filter(
				(e) => !(e.spaceId === spaceId && e.pageId === pageId),
			);
			// Prepend the new entry
			const next: RecentPage[] = [
				{ spaceId, pageId, title, openedAt: Date.now() },
				...filtered,
			].slice(0, MAX_RECENT);
			state.entries = next;
			saveToStorage(next);
		},
	},
});

const recentPagesReducer = recentPagesSlice.reducer;
const recentPagesActions = recentPagesSlice.actions;

function selectRecentPages(state: { recentPages: RecentPagesState }): RecentPage[] {
	// Already stored newest-first; return a stable copy sorted by openedAt desc
	return [...state.recentPages.entries].sort((a, b) => b.openedAt - a.openedAt);
}

export { MAX_RECENT, recentPagesActions, recentPagesReducer, selectRecentPages };
export type { RecentPage, RecentPagesState };
