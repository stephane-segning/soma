import { useTabsStore } from "@renderer/store/tabs";
import { useEffect } from "react";
import { useLocation, useMatches } from "react-router";
import { useSetLastRoute } from "../hooks/use-settings";

function RouterListener() {
	const location = useLocation();
	const matches = useMatches();
	const activeTabId = useTabsStore((s) => s.activeId);
	const setTabPath = useTabsStore((s) => s.setTabPath);
	const renameTab = useTabsStore((s) => s.renameTab);
	const [setLastRoute] = useSetLastRoute();

	useEffect(() => {
		if (location.pathname === "/") return;
		const next = `${location.pathname}${location.search}`;
		setLastRoute(next);
		if (activeTabId) setTabPath(activeTabId, next);
	}, [location.pathname, location.search, activeTabId, setTabPath]);

	useEffect(() => {
		if (!activeTabId) return;
		for (let index = matches.length - 1; index >= 0; index -= 1) {
			const handle = matches[index]?.handle as unknown;
			if (!handle || typeof handle !== "object") continue;
			const maybeTitle = (handle as { title?: unknown }).title;
			if (typeof maybeTitle === "string" && maybeTitle.trim()) {
				renameTab(activeTabId, maybeTitle);
				return;
			}
		}
	}, [matches, activeTabId, renameTab]);

	return null;
}

export { RouterListener };
