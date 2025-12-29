import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTauriStore } from "soma-ui/hooks/use-tauri-store";
import {
	LAST_ROUTE_KEY,
	normalizeRoute,
	SETTINGS_STORE_NAME,
} from "../services/settings-service";

/**
 * Setter hook for the last route; returns a stable setter function.
 */
export function useSetLastRoute(): [(route: string) => void] {
	const store = useTauriStore(SETTINGS_STORE_NAME);
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (route: string) => {
			const normalized = normalizeRoute(route);
			await store.init();
			await store.set(LAST_ROUTE_KEY, normalized);
			await store.save();
			return normalized;
		},
		onSuccess: (normalized) => {
			queryClient.setQueryData(["router", "lastRoute"], normalized);
		},
	});
	const set = useCallback(
		(route: string) => {
			mutation.mutate(route);
		},
		[mutation],
	);
	return [set];
}
