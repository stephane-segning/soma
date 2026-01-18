import { api, type PageRecord } from "@app/store/api";
import { useCallback } from "react";
import { useNavigate } from "react-router";

const usePagesQuery = (spaceId: string) =>
	api.useListPagesQuery(spaceId, {
		skip: !spaceId,
	});

function useEnsurePageMutation() {
	const [mutate, state] = api.useEnsurePageMutation();
	return {
		...state,
		isPending: state.isLoading,
		mutate,
		mutateAsync: (input: {
			spaceId: string;
			pageId?: string;
			title?: string;
			parentPageIds?: string[];
		}) => mutate(input).unwrap(),
	};
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
	const [mutate, state] = api.useUpdatePageTitleMutation();
	return {
		...state,
		isPending: state.isLoading,
		mutate,
		mutateAsync: (input: { spaceId: string; pageId: string; title: string }) =>
			mutate(input).unwrap(),
	};
}

function useSetPageParentsMutation() {
	const [mutate, state] = api.useSetPageParentsMutation();
	return {
		...state,
		isPending: state.isLoading,
		mutate,
		mutateAsync: (input: {
			spaceId: string;
			pageId: string;
			parentPageIds: string[];
		}) => mutate(input).unwrap(),
	};
}

export {
	useEnsurePageMutation,
	usePagesQuery,
	useCreatePage,
	useSetPageParentsMutation,
	useUpdatePageTitleMutation,
};
export type { PageRecord };
