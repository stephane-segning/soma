import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type PageRecord = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
};

function usePagesQuery(spaceId: string) {
	return useQuery({
		enabled: Boolean(spaceId),
		queryKey: ["pages", spaceId] as const,
		queryFn: async (): Promise<PageRecord[]> =>
			window.api.documents.listPages({ spaceId }),
	});
}

function useEnsurePageMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			pageId?: string;
			title?: string;
			parentPageIds?: string[];
		}): Promise<PageRecord> => window.api.documents.ensurePage(input),
		onSuccess: (data) => {
			void queryClient.invalidateQueries({
				queryKey: ["pages", data.spaceId],
			});
		},
	});
}

function useUpdatePageTitleMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			pageId: string;
			title: string;
		}): Promise<PageRecord | null> =>
			window.api.documents.updatePageTitle(input),
		onSuccess: (data, variables) => {
			if (data) {
				void queryClient.invalidateQueries({
					queryKey: ["pages", data.spaceId],
				});
			} else {
				void queryClient.invalidateQueries({
					queryKey: ["pages", variables.spaceId],
				});
			}
		},
	});
}

function useSetPageParentsMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			pageId: string;
			parentPageIds: string[];
		}): Promise<PageRecord | null> =>
			window.api.documents.setPageParents(input),
		onSuccess: (_data, variables) => {
			void queryClient.invalidateQueries({
				queryKey: ["pages", variables.spaceId],
			});
		},
	});
}

export {
	useEnsurePageMutation,
	usePagesQuery,
	useSetPageParentsMutation,
	useUpdatePageTitleMutation,
};
export type { PageRecord };
