import { useTabsStore } from "@soma/store/tabs";
import { useEffect, useMemo } from "react";
import { useLocation, useMatches } from "react-router";

type TitleHandle = {
	title?: string;
};

function RouterListener(): null {
	const activeId = useTabsStore((s) => s.activeId);
	const setTabPath = useTabsStore((s) => s.setTabPath);
	const renameTab = useTabsStore((s) => s.renameTab);

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
		setTabPath(activeId, path);
	}, [activeId, location.pathname, location.search, setTabPath]);

	useEffect(() => {
		if (!activeId) return;
		if (!routeTitle) return;
		renameTab(activeId, routeTitle);
	}, [activeId, renameTab, routeTitle]);

	return null;
}

export { RouterListener };
