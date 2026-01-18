import { api } from "@renderer/store/api";
import { useMemo, useState } from "react";
import { useDebounce } from "react-use";
import type { SearchResult } from "../services/search-service";

function useSearchQuery(rawQuery: string) {
	const [query, setQuery] = useState(() => rawQuery?.trim?.() ?? "");

	useDebounce(
		() => {
			setQuery(rawQuery?.trim?.());
		},
		150,
		[rawQuery],
	);

	const enabled = useMemo(() => query.length >= 2, [query]);

	return api.useSearchQuery(
		{ query, enabled },
		{
			skip: !enabled,
		},
	);
}

export { useSearchQuery };
export type { SearchResult };
