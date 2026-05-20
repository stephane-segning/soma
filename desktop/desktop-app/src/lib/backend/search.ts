import { call } from "./client";

export type SearchResult = {
	kind: string;
	id: string;
	title: string;
	spaceId: string;
};

export const search = {
	query: (q: string) => call<SearchResult[]>("search", { query: q }),
};
