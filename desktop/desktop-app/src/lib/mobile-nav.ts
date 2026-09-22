/**
 * Pure state-transition logic for the "verySmall"-tier bottom tab bar
 * (`MobileTabBarContainer`). Dependency-free (no React, no SDK) so the
 * actual navigation rule — which of `leftExpanded`/`rightExpanded` a
 * tap ends up mutating, and what re-tapping the active tab does — is
 * unit-testable without mounting the app's router/backend.
 *
 * The four mobile tabs (Pages, Chat, Bots, "More") map onto the same
 * two rail-expansion sets `AppLayout` already uses to drive the docked
 * rails at wider tiers (`leftExpanded` for Pages/Nav, `rightExpanded`
 * for Chat/Bots — see `left-inner-rail.tsx`'s `LEFT_RAIL_PANEL_IDS` /
 * `right-rail.tsx`'s `RIGHT_RAIL_PANEL_IDS`). At "verySmall" only one
 * tab is ever open at once (a fullscreen takeover), so selecting a tab
 * always *replaces* whichever set currently holds an id rather than
 * adding to it.
 *
 * `AppLayout` tracks the active tab as its own `mobileActiveTab` state
 * rather than deriving it from `leftExpanded`/`rightExpanded` directly
 * — those two default to *both* rail panels expanded (the desktop
 * default, e.g. `{"pages", "nav"}`), which would make the first tap on
 * a tab look like a "close" of a panel that was never actually visible
 * (nothing is summoned by default at narrow tiers — see
 * `useNarrowOverlayVisibility`'s doc comment). A dedicated `activeId`
 * that starts `null` and is only ever set by this module's own
 * transitions sidesteps that entirely.
 */

export type MobileNavSide = "left" | "right";

export type MobileNavTarget = {
	side: MobileNavSide;
	id: string;
};

export type MobileNavState = {
	left: ReadonlySet<string>;
	right: ReadonlySet<string>;
	/** The single open tab's id, or `null` when the editor is showing. */
	activeId: string | null;
};

function emptyState(): MobileNavState {
	return { left: new Set(), right: new Set(), activeId: null };
}

/**
 * Derives the active tab id from the two rail-expansion sets — at most
 * one id should be present across both at "verySmall", but this
 * degrades gracefully (left side wins) if a keyboard shortcut like ⌘/
 * ever puts more than one there. Exported mainly for tests; `AppLayout`
 * itself tracks `activeId` directly rather than re-deriving it on every
 * render (see the module doc comment for why).
 */
export function activeMobileTabId(left: ReadonlySet<string>, right: ReadonlySet<string>): string | null {
	for (const id of left) return id;
	for (const id of right) return id;
	return null;
}

/**
 * Tapping a tab. Re-tapping the currently-active tab closes it (back
 * to the editor); tapping a different tab replaces whichever side was
 * open with the new single id, closing the other side.
 */
export function selectMobileTab(activeId: string | null, target: MobileNavTarget): MobileNavState {
	if (activeId === target.id) return emptyState();
	return {
		left: target.side === "left" ? new Set([target.id]) : new Set(),
		right: target.side === "right" ? new Set([target.id]) : new Set(),
		activeId: target.id,
	};
}

/**
 * The shell's own back affordance (`ShellOverlayPanel`'s chevron) or
 * scrim-tap dismissal — same end state as re-tapping the active tab.
 */
export function dismissMobileTab(): MobileNavState {
	return emptyState();
}
