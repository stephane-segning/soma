import {
	useSetSettingMutation,
	useSettingQuery,
} from "@app/queries/settings";
import {
	useAppDispatch,
	useAppSelector,
} from "@app/store/hooks";
import { store } from "@app/store/store";
import {
	createDefaultState,
	isPersistedTabsStateV1,
	tabsActions,
	tabsSelectors,
} from "@app/store/tabs";
import {
	useEffect,
	useMemo,
} from "react";
import { RouterProvider } from "react-router";
import { createTabRouter } from "./router";

const SETTINGS_KEY =
	"ui:tabs";
const routers =
	new Map<
		string,
		ReturnType<
			typeof createTabRouter
		>
	>();

function getOrCreateRouter(
	tabId: string,
	initialPath: string,
) {
	const existing =
		routers.get(
			tabId,
		);
	if (
		existing
	)
		return existing;
	const next =
		createTabRouter(
			initialPath,
		);
	routers.set(
		tabId,
		next,
	);
	return next;
}

function TabbedApp(): React.JSX.Element | null {
	const dispatch =
		useAppDispatch();
	const initialized =
		useAppSelector(
			tabsSelectors.selectInitialized,
		);
	const activeId =
		useAppSelector(
			tabsSelectors.selectActiveId,
		);
	const tabs =
		useAppSelector(
			tabsSelectors.selectTabs,
		);

	const setSetting =
		useSetSettingMutation();
	const tabsSetting =
		useSettingQuery(
			SETTINGS_KEY,
		);

	useEffect(() => {
		if (
			initialized
		)
			return;
		if (
			tabsSetting.isLoading
		)
			return;

		const persisted =
			tabsSetting.data;
		if (
			isPersistedTabsStateV1(
				persisted,
			)
		) {
			dispatch(
				tabsActions.initFromPersisted(
					persisted,
				),
			);
			return;
		}

		const initialPath =
			window.location.hash.startsWith(
				"#",
			)
				? window.location.hash.slice(
						1,
					)
				: "";
		dispatch(
			tabsActions.initFromPersisted(
				createDefaultState(
					initialPath,
				),
			),
		);
	}, [
		dispatch,
		initialized,
		tabsSetting.data,
		tabsSetting.isLoading,
	]);

	useEffect(() => {
		if (
			!initialized
		)
			return;
		let timeout:
			| number
			| null =
			null;
		let prevTabsState =
			store.getState()
				.tabs;

		const unsubscribe =
			store.subscribe(
				() => {
					const nextTabsState =
						store.getState()
							.tabs;
					if (
						nextTabsState ===
						prevTabsState
					)
						return;
					prevTabsState =
						nextTabsState;

					if (
						timeout
					)
						window.clearTimeout(
							timeout,
						);
					timeout =
						window.setTimeout(
							() => {
								setSetting.mutate(
									{
										key: SETTINGS_KEY,
										value:
											tabsSelectors.selectPersisted(
												store.getState(),
											),
									},
								);
							},
							250,
						);
				},
			);

		return () => {
			if (
				timeout
			)
				window.clearTimeout(
					timeout,
				);
			unsubscribe();
		};
	}, [
		initialized,
		setSetting,
	]);

	useEffect(() => {
		if (
			!initialized
		)
			return;
		const persistNow =
			() => {
				setSetting.mutate(
					{
						key: SETTINGS_KEY,
						value:
							tabsSelectors.selectPersisted(
								store.getState(),
							),
					},
				);
			};
		window.addEventListener(
			"beforeunload",
			persistNow,
		);
		return () =>
			window.removeEventListener(
				"beforeunload",
				persistNow,
			);
	}, [
		initialized,
		setSetting,
	]);

	useEffect(() => {
		if (
			!initialized
		)
			return;
		const currentIds =
			new Set(
				tabs.map(
					(
						t,
					) =>
						t.id,
				),
			);
		for (const id of routers.keys()) {
			if (
				!currentIds.has(
					id,
				)
			)
				routers.delete(
					id,
				);
		}
	}, [
		initialized,
		tabs,
	]);

	const activeTab =
		useMemo(
			() =>
				tabs.find(
					(
						t,
					) =>
						t.id ===
						activeId,
				),
			[
				tabs,
				activeId,
			],
		);
	const router =
		useMemo(
			() =>
				initialized &&
				activeTab
					? getOrCreateRouter(
							activeTab.id,
							activeTab.path,
						)
					: null,
			[
				activeTab,
				initialized,
			],
		);

	if (
		!initialized ||
		!activeTab ||
		!router
	)
		return null;
	return (
		<div className="h-full w-full">
			<RouterProvider
				key={
					activeTab.id
				}
				router={
					router
				}
			/>
		</div>
	);
}

export {
	TabbedApp,
};
