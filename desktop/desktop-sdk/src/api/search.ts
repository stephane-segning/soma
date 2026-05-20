import type * as B from "../bindings";
import type { Transport } from "../transport";

export function search(t: Transport) {
	return {
		query: (q: string) => t.invoke<B.SearchResult[]>("search", { query: q }),
	};
}
