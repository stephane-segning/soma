import { createId } from "@paralleldrive/cuid2";
import { create } from "zustand";

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

type TabsStore = {
	initialized: boolean;
	activeId: string;
	tabs: Tab[];
	initFromPersisted: (state: PersistedTabsStateV1) => void;
	selectTab: (tabId: string) => void;
	openTab: (options?: { path?: string; title?: string }) => void;
	closeTab: (tabId: string) => void;
	setTabPath: (tabId: string, path: string) => void;
	renameTab: (tabId: string, title: string) => void;
	toPersisted: () => PersistedTabsStateV1;
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
		tabs: [{ id, title: "Tab 1", path: coercePath(initialPath) }],
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

const useTabsStore = create<TabsStore>((set, get) => ({
	initialized: false,
	activeId: "",
	tabs: [],
	initFromPersisted: (state) => {
		const next = isPersistedTabsStateV1(state)
			? state
			: createDefaultState("/");
		const activeId = next.tabs.some((t) => t.id === next.activeId)
			? next.activeId
			: next.tabs[0].id;
		set({
			initialized: true,
			activeId,
			tabs: next.tabs.map((t) => ({ ...t, path: coercePath(t.path) })),
		});
	},
	selectTab: (tabId) => {
		const { tabs } = get();
		if (!tabs.some((t) => t.id === tabId)) return;
		set({ activeId: tabId });
	},
	openTab: (options) => {
		const { tabs } = get();
		if (tabs.length >= MAX_TABS) return;
		const id = newTabId();
		const title = options?.title ?? `Tab ${tabs.length + 1}`;
		const path = coercePath(options?.path ?? "/");
		set({ tabs: [...tabs, { id, title, path }], activeId: id });
	},
	closeTab: (tabId) => {
		const { tabs, activeId } = get();
		const index = tabs.findIndex((t) => t.id === tabId);
		if (index === -1) return;

		const nextTabs = tabs.filter((t) => t.id !== tabId);
		if (nextTabs.length === 0) {
			const fallback = createDefaultState("/");
			set({ tabs: fallback.tabs, activeId: fallback.activeId });
			return;
		}

		if (activeId !== tabId) {
			set({ tabs: nextTabs });
			return;
		}

		const nextActive = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0];
		set({ tabs: nextTabs, activeId: nextActive.id });
	},
	setTabPath: (tabId, path) => {
		const nextPath = coercePath(path);
		set((state) => ({
			tabs: state.tabs.map((tab) =>
				tab.id === tabId ? { ...tab, path: nextPath } : tab,
			),
		}));
	},
	renameTab: (tabId, title) => {
		set((state) => ({
			tabs: state.tabs.map((tab) =>
				tab.id === tabId ? { ...tab, title } : tab,
			),
		}));
	},
	toPersisted: () => {
		const { activeId, tabs } = get();
		const safeActiveId = tabs.some((t) => t.id === activeId)
			? activeId
			: (tabs[0]?.id ?? "");
		return {
			version: 1,
			activeId: safeActiveId,
			tabs: tabs.map(({ id, title, path }) => ({ id, title, path })),
		};
	},
}));

export { createDefaultState, isPersistedTabsStateV1, useTabsStore };
export type { PersistedTabsStateV1 };
