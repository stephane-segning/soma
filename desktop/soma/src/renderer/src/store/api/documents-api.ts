import * as documentsService from "../../services/documents-service";
import type { DraftRow } from "./api-types";
import { pagesApi } from "./pages-api";

export const documentsApi = pagesApi.injectEndpoints({
	endpoints: (builder) => ({
		getDraft: builder.query<
			DraftRow | null,
			{
				spaceId: string;
				documentId: string;
			}
		>({
			queryFn: async ({ spaceId, documentId }) => {
				try {
					const data = await documentsService.getDraft({ spaceId, documentId });
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, { spaceId, documentId }) => [
				{
					type: "Draft",
					id: `${spaceId}:${documentId}`,
				},
			],
		}),
		upsertDraft: builder.mutation<
			void,
			{
				spaceId: string;
				documentId: string;
				contentJson: string;
				published: boolean;
			}
		>({
			queryFn: async (input) => {
				try {
					await documentsService.upsertDraft(input);
					return { data: undefined };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, { spaceId, documentId }) => [
				{
					type: "Draft",
					id: `${spaceId}:${documentId}`,
				},
			],
		}),
		queueDaemonSync: builder.mutation<
			void,
			{
				spaceId: string;
				documentId: string;
				contentJson: string;
				updatedAtMs: number;
				published?: boolean;
			}
		>({
			queryFn: async (input) => {
				try {
					await documentsService.queueDaemonSync(input);
					return { data: undefined };
				} catch (error) {
					return { error };
				}
			},
		}),
		syncPublishedDocument: builder.mutation<
			void,
			{
				spaceId: string;
				documentId: string;
				contentJson: string;
				updatedAtMs: number;
			}
		>({
			queryFn: async (input) => {
				try {
					await documentsService.syncPublishedDocument(input);
					return { data: undefined };
				} catch (error) {
					return { error };
				}
			},
		}),
	}),
});
