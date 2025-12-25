import type { SearchResult } from "../queries/search";

export async function search(query: string): Promise<SearchResult[]> {
	return window.api.search(query);
}

