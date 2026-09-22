/**
 * useSpacesList — the real space inventory, shared by every surface
 * that lists spaces (`SpacesRailContainer`'s icon rail,
 * `SpaceSwitcherContainer`'s "verySmall" sheet). Re-fetches on mount
 * and on the `join-decision` domain event, the one event kind that can
 * change the local inventory — see the original `SpacesRailContainer`
 * doc comment (pre-extraction) for why that list is kept narrow on
 * purpose (other events are higher-frequency and orthogonal).
 *
 * Monotonic request counter: the most recently-issued `load()` call's
 * id is recorded in `latestRequestRef`; older in-flight responses
 * compare their id against it and discard themselves so a slow earlier
 * response can't overwrite a faster later one.
 */
import type { SpaceRailItem } from "@soma/ui/components/nav/spaces-rail";
import { useEffect, useMemo, useRef, useState } from "react";
import { backend } from "./backend";

/** Generous upper bound — the SDK paginates at 50 by default, but
 *  callers treat the result as the full inventory. Anything beyond
 *  ~1000 spaces wouldn't fit either the rail or the switcher sheet UX
 *  anyway; revisit if that becomes a real ceiling. */
const SPACES_LIST_LIMIT = 1000;

const SPACE_LIST_AFFECTING: ReadonlySet<string> = new Set(["join-decision"]);

/** Two-letter monogram for the rail icon / switcher leading glyph.
 *  Codepoint-safe so emojis and other multi-byte glyphs don't get
 *  sliced mid-surrogate. */
function monogram(displayName: string): string {
	const cleaned = displayName.trim();
	if (!cleaned) return "··";
	const words = cleaned.split(/\s+/);
	if (words.length === 1) {
		// "Personal" → "PE"; "🌱garden" → "🌱g"
		return Array.from(cleaned).slice(0, 2).join("").toUpperCase();
	}
	// "My Team Space" → "MT" (first codepoint of each of the first two words)
	const first = Array.from(words[0])[0] ?? "";
	const second = Array.from(words[1])[0] ?? "";
	return `${first}${second}`.toUpperCase();
}

export function useSpacesList(): SpaceRailItem[] {
	const [items, setItems] = useState<SpaceRailItem[] | null>(null);
	const latestRequestRef = useRef(0);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const requestId = ++latestRequestRef.current;
			try {
				const result = await backend.spaces.list({
					q: null,
					limit: SPACES_LIST_LIMIT,
				});
				if (cancelled || requestId !== latestRequestRef.current) return;
				setItems(
					result.spaces.map((s) => ({
						id: s.spaceId,
						icon: monogram(s.displayName),
						name: s.displayName,
					})),
				);
			} catch (err) {
				if (cancelled || requestId !== latestRequestRef.current) return;
				console.error("[spaces-list] list failed", err);
				setItems([]);
			}
		}

		void load();

		const unsubscribe = backend.events.onDomain((event) => {
			if (SPACE_LIST_AFFECTING.has(event.kind)) void load();
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	return useMemo(() => items ?? [], [items]);
}
