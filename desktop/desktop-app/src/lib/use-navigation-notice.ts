/**
 * useNavigationNotice — reads a one-shot inline message handed over via
 * router `state`, then clears it so it doesn't resurface on the next
 * unrelated navigation (or on back/forward).
 *
 * Why this exists: some commands that can create a page or a space
 * (the ⌘N / ⌘⇧N shortcuts, the native menu, the command palette) run
 * *before* any specific route component is mounted — there's nothing
 * on screen yet to own a local error state. When one of those fails,
 * it navigates to the nearest sensible landing route (the space's
 * `SpaceView`, or `SpacesIndex` when there's no space at all) and
 * passes `{ state: { notice: message } }`. That landing route calls
 * this hook to surface the message inline (ADR-0005 §6 — no
 * toast-only feedback for primary actions) exactly once.
 *
 * Manual, component-owned failures (e.g. clicking SpaceView's own
 * "New Page" button) don't go through this at all — they keep their
 * error in local `useState`, right next to the pending flag. This hook
 * is only for the "the surface wasn't mounted yet when the action
 * failed" case.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

type NavigationState = { notice?: string } | null | undefined;

export function useNavigationNotice(): string | null {
	const location = useLocation();
	const navigate = useNavigate();
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		const state = location.state as NavigationState;
		const incoming = state?.notice ?? null;
		setNotice(incoming);
		if (incoming) {
			// Drop the state so a later re-render of the same entry (or a
			// back/forward through history) doesn't re-show a stale notice.
			// `location.state` is a fresh object per `navigate(..., {state})`
			// call even when the pathname repeats, so this still re-fires
			// correctly for "same route, new notice" (e.g. ⌘N failing twice
			// in a row while already on `SpaceView`) — `location.key` isn't
			// needed as a separate dependency.
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.pathname, location.state, navigate]);

	return notice;
}
