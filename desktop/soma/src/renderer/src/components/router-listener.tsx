import { useAppDispatch, useAppSelector } from "@soma/store/hooks";
import { tabsActions, tabsSelectors } from "@soma/store/tabs";
import { useEffect, useMemo } from "react";
import { useLocation, useMatches } from "react-router";

type TitleHandle = {
	title?: string;
};

function RouterListener(): null {
	const dispatch = useAppDispatch();
	const activeId = useAppSelector(tabsSelectors.selectActiveId);

	const location = useLocation();
	const matches = useMatches();

	const routeTitle = useMemo(() => {
		for (let index = matches.length - 1; index >= 0; index -= 1) {
			const handle = matches[index]?.handle as TitleHandle | undefined;
			if (typeof handle?.title === "string" && handle.title.trim().length > 0) {
				return handle.title;
			}
		}
		return null;
	}, [matches]);

	useEffect(() => {
		if (!activeId) return;
		const path = `${location.pathname}${location.search}`;
		dispatch(tabsActions.setTabPath({ tabId: activeId, path }));
	}, [activeId, dispatch, location.pathname, location.search]);

	useEffect(() => {
		if (!activeId) return;
		if (!routeTitle) return;
		dispatch(tabsActions.renameTab({ tabId: activeId, title: routeTitle }));
	}, [activeId, dispatch, routeTitle]);

	return null;
}

export { RouterListener };
