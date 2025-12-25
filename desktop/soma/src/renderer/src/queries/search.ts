import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import * as searchService from "../services/search-service";

type SearchResult = {
	id: string;
	title: string;
	subtitle?: string;
};

function useSearchQuery(rawQuery: string) {
	const [query] = useDebounce(rawQuery.trim(), 150);
	const enabled = query.length >= 2;

	return useQuery({
		queryKey: ["search", query] as const,
		enabled,
		queryFn: async (): Promise<SearchResult[]> => searchService.search(query),
	});
}

export { useSearchQuery };
export type { SearchResult };
