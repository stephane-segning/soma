import * as searchService from "../../services/search-service";
import { documentsApi } from "./documents-api";

export const searchApi = documentsApi.injectEndpoints({
	endpoints: (builder) => ({
		search: builder.query<
			searchService.SearchResult[],
			{
				query: string;
				enabled: boolean;
			}
		>({
			queryFn: async ({ query, enabled }) => {
				if (!enabled) return { data: [] };
				try {
					const data = await searchService.search(query);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, { query }) => [
				{
					type: "Search",
					id: query,
				},
			],
		}),
	}),
});
