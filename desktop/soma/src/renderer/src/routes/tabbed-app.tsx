import { tabsCollection } from "@app/data/db";
import { useAppDispatch, useAppSelector } from "@app/store/hooks";
import { store } from "@app/store/store";
import { createDefaultState, tabsActions, tabsSelectors } from "@app/store/tabs";
import { TABS_RECORD_ID, createTabsRecord, isTabsRecord, tabsRecordToSnapshot } from "@soma/desktop-db";
import { useEffect, useMemo } from "react";
import { RouterProvider } from "react-router";
import { createTabRouter } from "./router";

const routers = new Map<string, ReturnType<typeof createTabRouter>>();

function getOrCreateRouter(tabId: string, initialPath: string) {
	const existing = routers.get(tabId);
	if (existing) return existing;
	const next = createTabRouter(initialPath);
	routers.set(tabId, next);
	return next;
}

function persistTabs(): void {
	const snapshot = tabsSelectors.selectPersisted(store.getState());
	const record = createTabsRecord(snapshot, Date.now());
	const existing = tabsCollection.state.get(TABS_RECORD_ID);

	if (existing) {
		tabsCollection.update(TABS_RECORD_ID, (draft) => {
			draft.version = record.version;
			draft.updatedAtMs = record.updatedAtMs;
			draft.activeId = record.activeId;
			draft.tabs = record.tabs;
		});
		return;
	}

	tabsCollection.insert(record);
}

function TabbedApp(): React.JSX.Element | null {
	const dispatch = useAppDispatch();
	const initialized = useAppSelector(tabsSelectors.selectInitialized);
	const activeId = useAppSelector(tabsSelectors.selectActiveId);
	const tabs = useAppSelector(tabsSelectors.selectTabs);

	useEffect(() => {
		if (initialized) return;
		const persisted = tabsCollection.state.get(TABS_RECORD_ID);
		if (persisted && isTabsRecord(persisted)) {
			dispatch(tabsActions.initFromPersisted(tabsRecordToSnapshot(persisted)));
			return;
		}

		const initialPath = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
		dispatch(tabsActions.initFromPersisted(createDefaultState(initialPath)));
	}, [dispatch, initialized]);

	useEffect(() => {
		if (!initialized) return;
		let timeout: number | null = null;
		let prevTabsState = store.getState().tabs;

		const unsubscribe = store.subscribe(() => {
			const nextTabsState = store.getState().tabs;
			if (nextTabsState === prevTabsState) return;
			prevTabsState = nextTabsState;

			if (timeout) window.clearTimeout(timeout);
			timeout = window.setTimeout(() => {
				persistTabs();
			}, 250);
		});

		return () => {
			if (timeout) window.clearTimeout(timeout);
			unsubscribe();
		};
	}, [initialized]);

	useEffect(() => {
		if (!initialized) return;
		const persistNow = () => persistTabs();
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

	const activeTab = useMemo(() => tabs.find((t) => t.id === activeId), [tabs, activeId]);
	const router = useMemo(
		() => (initialized && activeTab ? getOrCreateRouter(activeTab.id, activeTab.path) : null),
		[activeTab, initialized],
	);

	if (!initialized || !activeTab || !router) return null;
	return (
		<div className="h-full w-full">
			<RouterProvider key={activeTab.id} router={router} />
		</div>
	);
}

export { TabbedApp };
