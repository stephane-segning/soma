import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTauriStore } from "soma-ui/hooks/use-tauri-store";

const TAPIA_STORE_NAME = "tapia-settings.json";
const STATUS_KEY = "lastStatus";

export function usePersistentStatus(initialStatus: string) {
	const store = useTauriStore(TAPIA_STORE_NAME);
	const queryClient = useQueryClient();

	const statusQuery = useQuery({
		queryKey: ["tapia", "status"],
		initialData: initialStatus,
		queryFn: async () => {
			try {
				await store.init();
				return (await store.get<string>(STATUS_KEY)) ?? initialStatus;
			} catch (err) {
				console.warn("Failed to load status from store", err);
				return initialStatus;
			}
		},
	});

	const persistStatus = useMutation({
		mutationFn: async (next: string) => {
			await store.init();
			await store.set(STATUS_KEY, next);
			await store.save();
			return next;
		},
		onSuccess: (next) => {
			queryClient.setQueryData(["tapia", "status"], next);
		},
		onError: (err) => {
			console.warn("Failed to persist status to store", err);
		},
	});

	const setStatus = useCallback(
		(next: string) => {
			persistStatus.mutate(next);
		},
		[persistStatus],
	);

	return {
		status: statusQuery.data ?? initialStatus,
		setStatus,
	};
}
