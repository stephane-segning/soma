import type { DaemonClient } from "../services/daemon-client";

export type SearchResult = {
	id: string;
	title: string;
	subtitle?: string;
};

export class SearchController {
	constructor(private readonly daemon: DaemonClient) {}

	async search(query: string): Promise<SearchResult[]> {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return [];

		const spaces = await this.daemon.listSpaces({ query: trimmed, limit: 100 });
		const spaceHits = spaces.spaces.map((s) => ({
			id: `space:${s.spaceId}`,
			title: s.displayName,
		}));

		const pageHits: SearchResult[] = [];
		for (const space of spaces.spaces) {
			const pages = await this.daemon.listPages(space.spaceId);
			const matches = pages
				.filter((p) => p.title.toLowerCase().includes(trimmed))
				.map((p) => ({
					id: `page:${p.pageId}`,
					title: p.title,
					subtitle: space.displayName || space.spaceId,
				}));
			pageHits.push(...matches);
		}

		return [...spaceHits, ...pageHits].slice(0, 100);
	}
}
