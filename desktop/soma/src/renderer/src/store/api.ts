import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import * as chatService from "../services/chat-service";
import * as documentsService from "../services/documents-service";
import * as searchService from "../services/search-service";
import * as settingsService from "../services/settings-service";
import * as spacesService from "../services/spaces-service";

type SpaceMember = spacesService.SpaceMember;
type PageRecord = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
};
type DraftRow = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
};

const api = createApi({
	reducerPath: "api",
	baseQuery: fakeBaseQuery(),
	tagTypes: [
		"Settings",
		"Spaces",
		"Space",
		"SpaceMembers",
		"Pages",
		"Draft",
		"Search",
		"AgentModels",
	],
	endpoints: (builder) => ({
		getSetting: builder.query<unknown, string>({
			queryFn: async (key) => {
				try {
					const data = await settingsService.getSetting(key);
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			providesTags: (_result, _error, key) => [
				{
					type: "Settings",
					id: key,
				},
			],
		}),
		setSetting: builder.mutation<
			void,
			{
				key: string;
				value: unknown;
			}
		>({
			queryFn: async ({ key, value }) => {
				try {
					await settingsService.setSetting(key, value);
					return {
						data: undefined,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			invalidatesTags: (_result, _error, { key }) => [
				{
					type: "Settings",
					id: key,
				},
			],
		}),

		listSpaces: builder.query<spacesService.ListSpacesResult, void>({
			queryFn: async () => {
				try {
					const data = await spacesService.listSpaces();
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			providesTags: () => [
				{
					type: "Spaces",
					id: "LIST",
				},
			],
		}),
		getSpace: builder.query<spacesService.Space | null, string>({
			queryFn: async (spaceId) => {
				try {
					const data = await spacesService.getSpace(spaceId);
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			providesTags: (_result, _error, spaceId) => [
				{
					type: "Space",
					id: spaceId,
				},
			],
		}),
		listSpaceMembers: builder.query<SpaceMember[], string>({
			queryFn: async (spaceId) => {
				try {
					const data = await spacesService.listSpaceMembers(spaceId);
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			providesTags: (_result, _error, spaceId) => [
				{
					type: "SpaceMembers",
					id: spaceId,
				},
			],
		}),
		createSpace: builder.mutation<
			spacesService.Space,
			{
				spaceId?: string;
				displayName?: string;
			}
		>({
			queryFn: async (input) => {
				try {
					const data = await spacesService.createSpace(input);
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			invalidatesTags: [
				{
					type: "Spaces",
					id: "LIST",
				},
			],
		}),
		updateSpace: builder.mutation<
			void,
			{
				spaceId: string;
				displayName?: string;
			}
		>({
			queryFn: async (input) => {
				try {
					await spacesService.updateSpace(input);
					return {
						data: undefined,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			invalidatesTags: (_result, _error, { spaceId }) => [
				{
					type: "Spaces",
					id: "LIST",
				},
				{
					type: "Space",
					id: spaceId,
				},
			],
		}),
		deleteSpace: builder.mutation<void, string>({
			queryFn: async (spaceId) => {
				try {
					await spacesService.deleteSpace(spaceId);
					return {
						data: undefined,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			invalidatesTags: (_result, _error, spaceId) => [
				{
					type: "Spaces",
					id: "LIST",
				},
				{
					type: "Space",
					id: spaceId,
				},
			],
		}),

		listPages: builder.query<PageRecord[], string>({
			queryFn: async (spaceId) => {
				try {
					const data = await documentsService.listPages({
						spaceId,
					});
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
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
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
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
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
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
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			invalidatesTags: (_result, _error, { spaceId }) => [
				{
					type: "Pages",
					id: spaceId,
				},
			],
		}),

		getDraft: builder.query<
			DraftRow | null,
			{
				spaceId: string;
				documentId: string;
			}
		>({
			queryFn: async ({ spaceId, documentId }) => {
				try {
					const data = await documentsService.getDraft({
						spaceId,
						documentId,
					});
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
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
					return {
						data: undefined,
					};
				} catch (error) {
					return {
						error,
					};
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
					return {
						data: undefined,
					};
				} catch (error) {
					return {
						error,
					};
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
					return {
						data: undefined,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
		}),

		search: builder.query<
			searchService.SearchResult[],
			{
				query: string;
				enabled: boolean;
			}
		>({
			queryFn: async ({ query, enabled }) => {
				if (!enabled)
					return {
						data: [],
					};
				try {
					const data = await searchService.search(query);
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			providesTags: (_result, _error, { query }) => [
				{
					type: "Search",
					id: query,
				},
			],
		}),

		listAgentModels: builder.query<chatService.AgentModel[], void>({
			queryFn: async () => {
				try {
					const data = await chatService.listModels();
					return {
						data,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
			providesTags: () => [
				{
					type: "AgentModels",
					id: "LIST",
				},
			],
		}),

		streamChat: builder.mutation<
			null,
			{
				history: chatService.ChatMessage[];
				model?: string;
			}
		>({
			queryFn: async ({ history, model }) => {
				try {
					const result = await chatService.streamChat(history, {
						model,
					});
					if (result.error) {
						throw new Error(result.error);
					}
					return {
						data: null,
					};
				} catch (error) {
					return {
						error,
					};
				}
			},
		}),
	}),
});

export { api };
export type { DraftRow, PageRecord, SpaceMember };
