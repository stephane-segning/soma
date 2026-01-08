import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import * as documentsService from "../services/documents-service";

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
			documentsService.listPages({ spaceId }),
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
		}): Promise<PageRecord> => documentsService.ensurePage(input),
		onSuccess: (data) => {
			void queryClient.invalidateQueries({
				queryKey: ["pages", data.spaceId],
			});
		},
	});
}

function useCreatePage(spaceId: string) {
	const ensurePage = useEnsurePageMutation();
	const navigate = useNavigate();

	const createPage = useCallback(
		async (parentPageIds: string[], nav = false) => {
			const created = await ensurePage.mutateAsync({
				spaceId,
				parentPageIds,
			});

			if (nav) {
				navigate(`/spaces/${spaceId}/pages/${created.pageId}`);
			}
		},
		[ensurePage, navigate, spaceId],
	);

	return {
		...ensurePage,
		createPage,
	};
}

function useUpdatePageTitleMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			spaceId: string;
			pageId: string;
			title: string;
		}): Promise<PageRecord | null> => documentsService.updatePageTitle(input),
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
		}): Promise<PageRecord | null> => documentsService.setPageParents(input),
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
	useCreatePage,
	useSetPageParentsMutation,
	useUpdatePageTitleMutation,
};
export type { PageRecord };
