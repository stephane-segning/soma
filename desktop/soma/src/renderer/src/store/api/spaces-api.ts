import * as spacesService from "../../services/spaces-service";
import { settingsApi } from "./settings-api";

export const spacesApi = settingsApi.injectEndpoints({
	endpoints: (builder) => ({
		listSpaces: builder.query<spacesService.ListSpacesResult, void>({
			queryFn: async () => {
				try {
					const data = await spacesService.listSpaces();
					return { data };
				} catch (error) {
					return { error };
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
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, spaceId) => [
				{
					type: "Space",
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
					return { data };
				} catch (error) {
					return { error };
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
					return { data: undefined };
				} catch (error) {
					return { error };
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
					return { data: undefined };
				} catch (error) {
					return { error };
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
	}),
});
