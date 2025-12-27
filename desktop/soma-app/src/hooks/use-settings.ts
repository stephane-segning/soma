import { useCallback } from "react";
import * as settingsService from "../services/settings-service";

/**
 * Setter hook for the last route; returns a stable setter function.
 */
export function useSetLastRoute(): [(route: string) => void] {
	const set = useCallback((route: string) => {
		settingsService.setLastRoute(route);
	}, []);
	return [set];
}
