import {
	createDefaultState,
	isPersistedTabsStateV1,
	useTabsStore,
} from "@renderer/store/tabs";
import { useEffect } from "react";
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

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			const [persisted, lastRoute] = await Promise.all([
				window.api.getSetting(SETTINGS_KEY),
				window.api.getLastRoute().catch(() => ""),
			]);
			if (cancelled) return;

			if (isPersistedTabsStateV1(persisted)) {
				initFromPersisted(persisted);
				return;
			}

			const hashPath = window.location.hash.startsWith("#")
				? window.location.hash.slice(1)
				: "";
			const initialPath = lastRoute || hashPath || "/";
			initFromPersisted(createDefaultState(initialPath));
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, [initFromPersisted]);

	useEffect(() => {
		if (!initialized) return;
		let timeout: number | null = null;

		const unsubscribe = useTabsStore.subscribe(
			(state) => [state.tabs, state.activeId] as const,
			() => {
				if (timeout) window.clearTimeout(timeout);
				timeout = window.setTimeout(() => {
					window.ipc.sendToMain("settings:set", {
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
	}, [initialized]);

	useEffect(() => {
		if (!initialized) return;
		const persistNow = () => {
			window.ipc.sendToMain("settings:set", {
				key: SETTINGS_KEY,
				value: useTabsStore.getState().toPersisted(),
			});
		};
		window.addEventListener("beforeunload", persistNow);
		return () => window.removeEventListener("beforeunload", persistNow);
	}, [initialized]);

	useEffect(() => {
		if (!initialized) return;
		const currentIds = new Set(tabs.map((t) => t.id));
		for (const id of routers.keys()) {
			if (!currentIds.has(id)) routers.delete(id);
		}
	}, [initialized, tabs]);

	const activeTab = tabs.find((t) => t.id === activeId);
	const router =
		initialized && activeTab
			? getOrCreateRouter(activeTab.id, activeTab.path)
			: null;

	if (!initialized || !activeTab || !router) return null;
	return <RouterProvider key={activeTab.id} router={router} />;
}

export { TabbedApp };
