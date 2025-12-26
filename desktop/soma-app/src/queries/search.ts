import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebounce } from "react-use";
import * as searchService from "../services/search-service";

type SearchResult = {
	id: string;
	title: string;
	subtitle?: string;
};

function useSearchQuery(rawQuery: string) {
	const [query, setQuery] = useState(() => rawQuery.trim());

	useDebounce(
		() => {
			setQuery(rawQuery.trim);
		},
		150,
		[rawQuery],
	);

	const enabled = useMemo(() => query.length >= 2, [query]);

	return useQuery({
		queryKey: ["search", query] as const,
		enabled,
		queryFn: async (): Promise<SearchResult[]> => searchService.search(query),
	});
}

export { useSearchQuery };
export type { SearchResult };
