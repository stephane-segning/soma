/**
 * RouteErrorBoundary — react-router `errorElement` for a single route.
 *
 * react-router's data routers catch both loader/action errors *and*
 * render-time throws from the route's own element (internally via a
 * real React error boundary) and expose whichever was thrown through
 * `useRouteError()`. Wiring this as `errorElement` on each content
 * route (see `routes/router.tsx`) means a crash — e.g. inside the
 * Tiptap editor on `spaces/:spaceId/pages/:pageId` — replaces only
 * that route's slot; `AppLayout`'s rails/header (the parent layout
 * route) stay mounted, so the user can navigate away instead of
 * staring at a blank app.
 *
 * Recovery is automatic on navigation, too: react-router clears a
 * route's stored error the moment you navigate to a different match,
 * so this needs no manual "reset" wiring (unlike a hand-rolled
 * boundary wrapping `<Outlet/>`, which would need its own
 * reset-on-location-change logic to avoid getting stuck showing a
 * stale fallback).
 *
 * `variant="fatal"` is used only on the root `"/"` route: if
 * `AppLayout` itself throws, there's no surviving shell to offer "Back
 * to Spaces" from — re-rendering it would just throw again — so the
 * fallback there matches `AppErrorBoundary`'s (hard reload only).
 */
import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { ErrorFallback } from "./error-fallback";

export function RouteErrorBoundary({ variant = "route" }: { variant?: "route" | "fatal" }) {
	const error = useRouteError();

	// Never swallow silently — this is the one place a render-time or
	// loader throw is guaranteed to pass through, so it's the right spot
	// to guarantee it also reaches the console for debugging.
	useEffect(() => {
		console.error("[route-error-boundary]", error);
	}, [error]);

	const normalized = isRouteErrorResponse(error) ? new Error(`${error.status} ${error.statusText}`) : error;

	return <ErrorFallback error={normalized} variant={variant} />;
}
