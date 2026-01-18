import { createId } from "@paralleldrive/cuid2";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type PersistedTab = {
	id: string;
	title: string;
	path: string;
};

type PersistedTabsStateV1 = {
	version: 1;
	activeId: string;
	tabs: PersistedTab[];
};

type Tab = PersistedTab;

type TabsState = {
	initialized: boolean;
	activeId: string;
	tabs: Tab[];
};

const MAX_TABS = 10;

function newTabId(): string {
	return createId();
}

function coercePath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return "/";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function createDefaultState(initialPath = "/"): PersistedTabsStateV1 {
	const id = newTabId();
	return {
		version: 1,
		activeId: id,
		tabs: [
			{
				id,
				title: "Tab 1",
				path: coercePath(initialPath),
			},
		],
	};
}

function isPersistedTabsStateV1(value: unknown): value is PersistedTabsStateV1 {
	if (!value || typeof value !== "object") return false;
	const maybe = value as Partial<PersistedTabsStateV1>;
	if (maybe.version !== 1) return false;
	if (typeof maybe.activeId !== "string") return false;
	if (!Array.isArray(maybe.tabs) || maybe.tabs.length === 0) return false;
	for (const tab of maybe.tabs) {
		if (!tab || typeof tab !== "object") return false;
		const t = tab as Partial<PersistedTab>;
		if (typeof t.id !== "string") return false;
		if (typeof t.title !== "string") return false;
		if (typeof t.path !== "string") return false;
	}
	return true;
}

function tabsToPersisted(state: TabsState): PersistedTabsStateV1 {
	const safeActiveId = state.tabs.some((t) => t.id === state.activeId)
		? state.activeId
		: (state.tabs[0]?.id ?? "");
	return {
		version: 1,
		activeId: safeActiveId,
		tabs: state.tabs.map(({ id, title, path }) => ({
			id,
			title,
			path,
		})),
	};
}

const initialState: TabsState = {
	initialized: false,
	activeId: "",
	tabs: [],
};

const tabsSlice = createSlice({
	name: "tabs",
	initialState,
	reducers: {
		initFromPersisted(state, action: PayloadAction<PersistedTabsStateV1>) {
			const next = isPersistedTabsStateV1(action.payload)
				? action.payload
				: createDefaultState("/");
			const activeId = next.tabs.some((t) => t.id === next.activeId)
				? next.activeId
				: next.tabs[0].id;
			state.initialized = true;
			state.activeId = activeId;
			state.tabs = next.tabs.map((t) => ({
				...t,
				path: coercePath(t.path),
			}));
		},
		selectTab(state, action: PayloadAction<string>) {
			const tabId = action.payload;
			if (state.activeId === tabId) return;
			if (!state.tabs.some((t) => t.id === tabId)) return;
			state.activeId = tabId;
		},
		openTab: {
			prepare(options?: { path?: string; title?: string }) {
				return {
					payload: {
						id: newTabId(),
						options,
					},
				};
			},
			reducer(
				state,
				action: PayloadAction<{
					id: string;
					options?: {
						path?: string;
						title?: string;
					};
				}>,
			) {
				if (state.tabs.length >= MAX_TABS) return;

				const title =
					action.payload.options?.title ?? `Tab ${state.tabs.length + 1}`;
				const path = coercePath(action.payload.options?.path ?? "/");

				state.tabs.push({
					id: action.payload.id,
					title,
					path,
				});
				state.activeId = action.payload.id;
			},
		},
		closeTab(state, action: PayloadAction<string>) {
			const tabId = action.payload;
			const index = state.tabs.findIndex((t) => t.id === tabId);
			if (index === -1) return;

			const nextTabs = state.tabs.filter((t) => t.id !== tabId);
			if (nextTabs.length === 0) {
				const fallback = createDefaultState("/");
				state.tabs = fallback.tabs;
				state.activeId = fallback.activeId;
				return;
			}

			if (state.activeId !== tabId) {
				state.tabs = nextTabs;
				return;
			}

			const nextActive = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0];
			state.tabs = nextTabs;
			state.activeId = nextActive.id;
		},
		setTabPath(
			state,
			action: PayloadAction<{
				tabId: string;
				path: string;
			}>,
		) {
			const nextPath = coercePath(action.payload.path);
			const tab = state.tabs.find((t) => t.id === action.payload.tabId);
			if (!tab) return;
			if (tab.path === nextPath) return;
			tab.path = nextPath;
		},
		renameTab(
			state,
			action: PayloadAction<{
				tabId: string;
				title: string;
			}>,
		) {
			const tab = state.tabs.find((t) => t.id === action.payload.tabId);
			if (!tab) return;
			if (tab.title === action.payload.title) return;
			tab.title = action.payload.title;
		},
	},
});

const tabsReducer = tabsSlice.reducer;
const tabsActions = tabsSlice.actions;

const tabsSelectors = {
	selectInitialized: (state: { tabs: TabsState }) => state.tabs.initialized,
	selectActiveId: (state: { tabs: TabsState }) => state.tabs.activeId,
	selectTabs: (state: { tabs: TabsState }) => state.tabs.tabs,
	selectPersisted: (state: { tabs: TabsState }) => tabsToPersisted(state.tabs),
};

export {
	MAX_TABS,
	createDefaultState,
	isPersistedTabsStateV1,
	tabsActions,
	tabsReducer,
	tabsSelectors,
	tabsToPersisted,
};
export type { PersistedTabsStateV1 };
