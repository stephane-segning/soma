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
 * This hook suppresses that: at a narrow tier, the overlay starts
 * hidden regardless of `content`, and only becomes visible once
 * `content` makes a genuine empty -> non-empty transition (the only
 * "the user just asked for this" signal available without the caller
 * wiring anything extra) rather than whatever was already true the
 * moment the tier went narrow. Once summoned this way it tracks
 * `content` normally (open/close) for the rest of the component's
 * lifetime — including later comfortable <-> narrow round-trips, which
 * intentionally do *not* re-suppress (a desktop user briefly shrinking
 * the window shouldn't hide a panel they deliberately opened).
 *
 * Known gap: if `content` stays non-empty across a close-one/open-
 * another sequence (two panels sharing one rail's `content` slot,
 * swapped without ever going empty), that doesn't count as a fresh
 * transition. Fine for the common "cold launch with desktop defaults"
 * case; a precise per-panel signal needs the caller (which owns the
 * panel-id state) to pass it through explicitly — out of scope here.
 */
export function useNarrowOverlayVisibility(
	tier: ShellTier,
	hasContent: boolean,
): boolean {
	const [summoned, setSummoned] = useState(false);
	const prevHasContent = useRef(hasContent);

	// Conditional set-state-during-render: React's sanctioned way to
	// derive state from a prop transition. Guarded by `!summoned` so it
	// only ever fires once per mount (no render loop).
	if (
		tier !== "comfortable" &&
		hasContent &&
		!prevHasContent.current &&
		!summoned
	) {
		setSummoned(true);
	}
	prevHasContent.current = hasContent;

	if (tier === "comfortable") return hasContent;
	return hasContent && summoned;
}
