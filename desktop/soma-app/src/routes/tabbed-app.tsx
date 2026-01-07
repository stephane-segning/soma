import { useSetSettingMutation, useSettingQuery } from "@soma/queries/settings";
import {
	createDefaultState,
	isPersistedTabsStateV1,
	useTabsStore,
} from "@soma/store/tabs";
import { useEffect, useMemo } from "react";
import { RouterProvider } from "react-router";
import { createTabRouter } from "./router";

const SETTINGS_KEY = "ui:tabs";
const routers = new Map<string, ReturnType<typeof createTabRouter>>();

function getOrCreateRouter(tabId: string, initialPath: string) {
	const existing = routers.get(tabId);
	if (existing) return existing;
	const next = createTabRouter(initialPath);
	routers.set(tabId, next);
	return next;
}

function TabbedApp(): React.JSX.Element | null {
	const initialized = useTabsStore((s) => s.initialized);
	const activeId = useTabsStore((s) => s.activeId);
	const tabs = useTabsStore((s) => s.tabs);
	const initFromPersisted = useTabsStore((s) => s.initFromPersisted);

	const setSetting = useSetSettingMutation();
	const tabsSetting = useSettingQuery(SETTINGS_KEY);

	useEffect(() => {
		if (initialized) return;
		if (tabsSetting.isLoading) return;

		const persisted = tabsSetting.data;
		if (isPersistedTabsStateV1(persisted)) {
			initFromPersisted(persisted);
			return;
		}

		const initialPath = window.location.hash.startsWith("#")
			? window.location.hash.slice(1)
			: "";
		initFromPersisted(createDefaultState(initialPath));
	}, [initialized, initFromPersisted, tabsSetting.data, tabsSetting.isLoading]);

	useEffect(() => {
		if (!initialized) return;
		let timeout: number | null = null;

		const unsubscribe = useTabsStore.subscribe(() => {
			if (timeout) window.clearTimeout(timeout);
			timeout = window.setTimeout(() => {
				setSetting.mutate({
					key: SETTINGS_KEY,
					value: useTabsStore.getState().toPersisted(),
				});
			}, 250);
		});

		return () => {
			if (timeout) window.clearTimeout(timeout);
			unsubscribe();
		};
	}, [initialized, setSetting]);

	useEffect(() => {
		if (!initialized) return;
		const persistNow = () => {
			setSetting.mutate({
				key: SETTINGS_KEY,
				value: useTabsStore.getState().toPersisted(),
			});
		};
		window.addEventListener("beforeunload", persistNow);
		return () => window.removeEventListener("beforeunload", persistNow);
	}, [initialized, setSetting]);

	useEffect(() => {
		if (!initialized) return;
		const currentIds = new Set(tabs.map((t) => t.id));
		for (const id of routers.keys()) {
			if (!currentIds.has(id)) routers.delete(id);
		}
	}, [initialized, tabs]);

	const activeTab = useMemo(
		() => tabs.find((t) => t.id === activeId),
		[tabs, activeId],
	);
	const router = useMemo(
		() =>
			initialized && activeTab
				? getOrCreateRouter(activeTab.id, activeTab.path)
				: null,
		[activeTab, initialized],
	);

	if (!initialized || !activeTab || !router) return null;
	return (
		<div className="h-full w-full" data-no-drag>
			<RouterProvider key={activeTab.id} router={router} />
		</div>
	);
}

export { TabbedApp };
