import { invoke } from "@tauri-apps/api/core";
import type { SearchResult } from "../queries/search";

export async function search(query: string): Promise<SearchResult[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	return invoke<SearchResult[]>("search", { query: trimmed }).catch(() => []);
}
