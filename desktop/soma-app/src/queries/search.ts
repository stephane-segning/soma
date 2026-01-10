import { api } from "@soma/store/api";
import type { SearchResult } from "../services/search-service";
import { useMemo, useState } from "react";
import { useDebounce } from "react-use";

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
