import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as settingsService from "../services/settings-service";

type SetSettingInput = { key: string; value: unknown };

function useSettingQuery<T = unknown>(key: string) {
	return useQuery({
		queryKey: ["settings", key] as const,
		queryFn: async () => settingsService.getSetting<T>(key),
	});
}

function useLastRouteQuery() {
	return useQuery({
		queryKey: ["router", "lastRoute"] as const,
		queryFn: async () => settingsService.getLastRoute(),
	});
}

function useSetSettingMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ key, value }: SetSettingInput) => {
			return settingsService.setSetting(key, value);
		},
		onSuccess: (_data, variables) => {
			void queryClient.invalidateQueries({
				queryKey: ["settings", variables.key],
			});
		},
	});
}

export { useLastRouteQuery, useSetSettingMutation, useSettingQuery };
