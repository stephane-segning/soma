import { createId } from "@paralleldrive/cuid2";

export type PersistedTab = {
	id: string;
	title: string;
	path: string;
};

export type PersistedTabsStateV1 = {
	version: 1;
	activeId: string;
	tabs: PersistedTab[];
};

export type Tab = PersistedTab;

export type TabsState = {
	initialized: boolean;
	activeId: string;
	tabs: Tab[];
};

export const MAX_TABS = 10;

export function newTabId(): string {
	return createId();
}

export function coercePath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return "/";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function createDefaultState(initialPath = "/"): PersistedTabsStateV1 {
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

export function isPersistedTabsStateV1(value: unknown): value is PersistedTabsStateV1 {
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

export function tabsToPersisted(state: TabsState): PersistedTabsStateV1 {
	const safeActiveId = state.tabs.some((tab) => tab.id === state.activeId) ? state.activeId : (state.tabs[0]?.id ?? "");
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
