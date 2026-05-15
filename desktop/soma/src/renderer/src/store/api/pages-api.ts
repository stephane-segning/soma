import * as documentsService from "../../services/documents-service";
import { accessApi } from "./access-api";
import type { PageRecord } from "./api-types";

export const pagesApi = accessApi.injectEndpoints({
	endpoints: (builder) => ({
		listPages: builder.query<PageRecord[], string>({
			queryFn: async (spaceId) => {
				try {
					const data = await documentsService.listPages({ spaceId });
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, spaceId) => [
				{
					type: "Pages",
					id: spaceId,
				},
			],
		}),
		ensurePage: builder.mutation<
			PageRecord,
			{
				spaceId: string;
				pageId?: string;
				title?: string;
				parentPageIds?: string[];
			}
		>({
			queryFn: async (input) => {
				try {
					const data = await documentsService.ensurePage(input);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, { spaceId }) => [
				{
					type: "Pages",
					id: spaceId,
				},
			],
		}),
		updatePageTitle: builder.mutation<
			PageRecord | null,
			{
				spaceId: string;
				pageId: string;
				title: string;
			}
		>({
			queryFn: async (input) => {
				try {
					const data = await documentsService.updatePageTitle(input);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, { spaceId }) => [
				{
					type: "Pages",
					id: spaceId,
				},
			],
		}),
		setPageParents: builder.mutation<
			PageRecord | null,
			{
				spaceId: string;
				pageId: string;
				parentPageIds: string[];
			}
		>({
			queryFn: async (input) => {
				try {
					const data = await documentsService.setPageParents(input);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, { spaceId }) => [
				{
					type: "Pages",
					id: spaceId,
				},
			],
		}),
	}),
});
