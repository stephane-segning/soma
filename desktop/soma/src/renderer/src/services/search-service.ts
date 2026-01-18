import { invoke } from "../lib/ipc";

export type SearchResult = {
	id: string;
	title: string;
	subtitle?: string;
};

export async function search(query: string): Promise<SearchResult[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	return invoke<SearchResult[]>("search", {
		query: trimmed,
	}).catch(() => []);
}
