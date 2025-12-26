import {
	useLastRouteQuery,
	useSetSettingMutation,
	useSettingQuery,
} from "@soma/queries/settings";
import { ChatSidebar } from "@soma/routes/chat-sidebar";
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
	const lastRoute = useLastRouteQuery();

	useEffect(() => {
		if (initialized) return;
		if (tabsSetting.isLoading || lastRoute.isLoading) return;

		const persisted = tabsSetting.data;
		if (isPersistedTabsStateV1(persisted)) {
			initFromPersisted(persisted);
			return;
		}

		const hashPath = window.location.hash.startsWith("#")
			? window.location.hash.slice(1)
			: "";
		const initialPath = lastRoute.data || hashPath || "/";
		initFromPersisted(createDefaultState(initialPath));
	}, [
		initialized,
		initFromPersisted,
		tabsSetting.data,
		tabsSetting.isLoading,
		lastRoute.data,
		lastRoute.isLoading,
	]);

	useEffect(() => {
		if (!initialized) return;
		let timeout: number | null = null;

		const unsubscribe = useTabsStore.subscribe(
			(state) => [state.tabs, state.activeId] as const,
			// @ts-expect-error
			() => {
				if (timeout) window.clearTimeout(timeout);
				timeout = window.setTimeout(() => {
					setSetting.mutate({
						key: SETTINGS_KEY,
						value: useTabsStore.getState().toPersisted(),
					});
				}, 250);
			},
		);

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
		<div className="grid h-full w-full grid-cols-[minmax(0,1fr)_360px]">
			<div className="min-h-0 min-w-0 overflow-auto" data-no-drag>
				<RouterProvider key={activeTab.id} router={router} />
			</div>
			<aside className="sticky top-0" data-no-drag>
				<ChatSidebar />
			</aside>
		</div>
	);
}

export { TabbedApp };
