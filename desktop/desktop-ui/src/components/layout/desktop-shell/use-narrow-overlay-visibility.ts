import { useRef, useState } from "react";
import type { ShellTier } from "./use-shell-tier";

/**
 * At the "tight"/"verySmall" tiers (ADR-0005 §2) a rail's `content`
 * renders as an overlay (drawer/fullscreen) instead of a docked column.
 * Docked presentation at "comfortable" always mirrors `Boolean(content)`
 * directly — but doing the same at narrow tiers would mean an app's
 * *default* open panels (sized for desktop) immediately cover the
 * editor the moment the app boots at phone width, contradicting
 * "editor is the priority surface" for the very-small tier.
 *
 * This hook suppresses that: at a narrow tier the overlay starts
 * hidden regardless of `content`, and becomes visible only once the
 * user actually asks for it. Once summoned it tracks `content`
 * normally (open/close) for the rest of the component's lifetime —
 * including later comfortable <-> narrow round-trips.
 *
 * # Why `summonKey` exists
 *
 * "The user just asked for this" used to be inferred from `hasContent`
 * making an empty -> non-empty transition, which is wrong whenever a
 * column hosts more than one panel. With both Pages and Nav expanded
 * at mount (restored from persisted chip state), `hasContent` is true
 * on the very first render and *stays* true through every subsequent
 * toggle — so the transition never happens and the rail becomes
 * permanently unopenable: its chip reads pressed, nothing renders, and
 * clicking that chip can't fix it. Recovering meant collapsing every
 * panel in the column first, which no user would think to try.
 *
 * `summonKey` is the caller's own summary of *which* panels it is
 * asking for (e.g. the sorted, joined set of expanded panel ids). Any
 * change to it while `content` is non-empty is a real user action, so
 * it summons. It is deliberately not compared for "grew" vs "shrank" —
 * turning one panel off and another on is still the user summoning
 * that second panel.
 *
 * Callers that pass no key keep the old transition heuristic, which is
 * still correct for a single-panel column.
 */
export function useNarrowOverlayVisibility(
	tier: ShellTier,
	hasContent: boolean,
	summonKey?: string | number,
): boolean {
	const [summoned, setSummoned] = useState(false);
	const prevHasContent = useRef(hasContent);
	const prevSummonKey = useRef(summonKey);

	const askedForIt =
		summonKey === undefined
			? !prevHasContent.current
			: summonKey !== prevSummonKey.current;

	// Conditional set-state-during-render: React's sanctioned way to
	// derive state from a prop transition. Guarded by `!summoned` so it
	// only ever fires once per mount (no render loop).
	if (tier !== "comfortable" && hasContent && askedForIt && !summoned) {
		setSummoned(true);
	}
	prevHasContent.current = hasContent;
	prevSummonKey.current = summonKey;

	if (tier === "comfortable") return hasContent;
	return hasContent && summoned;
}
