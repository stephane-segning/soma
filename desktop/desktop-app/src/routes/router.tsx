/**
 * Shell router — Phase 1 foundation.
 *
 * Stubs the route tree we need for the desktop shell rebuild: a top-level
 * `app-layout` that owns the 3-column `DesktopShell`, with nested
 * placeholder routes for `/spaces`, `/spaces/:spaceId`, `/settings`,
 * and a `/spike/editor` page that preserves the original Tauri-on-
 * WKWebView focus probe from the smoke-test App.
 *
 * Real space data, the right-column chat sidebar, command palette,
 * tabs bar, splash, and deep-link landing are deferred to later phases.
 *
 * Router choice depends on the runtime: Tauri ships a webview with no
 * address bar and no server behind it, so `createMemoryRouter` (history
 * kept in-process, seeded at `"/"`) is the only router that makes sense
 * there. A plain browser tab (the web build) gets `createBrowserRouter`
 * instead — real URLs, working back/forward, and a refresh that
 * survives, as long as whatever serves the static bundle rewrites
 * unmatched paths to `index.html` (every client-routed SPA needs that,
 * regardless of which router drives it).
 */

import { isTauri } from "@tauri-apps/api/core";
import type { LoaderFunctionArgs, RouteObject } from "react-router";
import { createBrowserRouter, createMemoryRouter, redirect } from "react-router";
import { RouteErrorBoundary } from "../components/error-boundary/route-error-boundary";
import { backend } from "../lib/backend";
import { AppLayout } from "./app-layout";
import { JoinSpacePage } from "./join-space";
import { NotFound } from "./not-found";
import { PageView } from "./page-view";
import { PracticePage } from "./practice";
import { rootRedirectLoader } from "./root-redirect";
import { SettingsPage } from "./settings";
import { SpaceSettingsPage } from "./space-settings";
import { SpaceView } from "./space-view";
import { SpacesIndex } from "./spaces-index";
import { SpikeEditor } from "./spike-editor";

/**
 * `/spaces/:spaceId/members` used to render an inert `Empty` placeholder
 * (`SpaceMembersPlaceholder`, removed). It now has a real successor — the
 * Members tab of `spaces/:spaceId/settings` — so old links/bookmarks
 * redirect there instead of 404ing. `/spaces/:spaceId/info` had no
 * matching successor built (there is no "space info" tab in this pass)
 * and is deliberately NOT redirected — it falls through to the `*` route
 * (`NotFound`) below rather than landing users on a tab with nothing to
 * do with "info".
 */
function spaceMembersRedirectLoader({ params }: LoaderFunctionArgs): Response {
	return redirect(`/spaces/${params.spaceId}/settings`);
}

/**
 * `/practice` (flat, no space id) used to 404 outright — the route was
 * dropped in the Electron→Tauri rewrite and never restored. Its real
 * home is `spaces/:spaceId/practice` (practice content is per-space,
 * same as pages), so this loader picks a space the same way a brand
 * new session lands on one at all: the first space the SDK returns.
 * Zero spaces means there's nowhere to practice yet, same reasoning
 * `rootRedirectLoader` already applies — land on `/spaces` instead.
 */
async function practiceRedirectLoader(): Promise<Response> {
	try {
		const result = await backend.spaces.list({ q: null, limit: 1 });
		const first = result.spaces[0];
		if (first) return redirect(`/spaces/${first.spaceId}/practice`);
	} catch (err) {
		console.error("[router] practice redirect: spaces.list failed", err);
	}
	return redirect("/spaces");
}

const routes: RouteObject[] = [
	{
		path: "/",
		Component: AppLayout,
		// Root-level net: only reachable if `AppLayout` itself throws (a
		// child route throwing is caught by that route's own errorElement
		// below instead, without unmounting AppLayout's shell). No shell
		// survives an AppLayout crash, so this is the one route that gets
		// the "fatal" (hard-reload-only) fallback — see
		// `RouteErrorBoundary`'s doc comment.
		errorElement: <RouteErrorBoundary variant="fatal" />,
		children: [
			{
				index: true,
				loader: rootRedirectLoader,
				Component: () => null,
			},
			{
				path: "spaces",
				Component: SpacesIndex,
				errorElement: <RouteErrorBoundary />,
			},
			{
				// Invitee-side redeem/confirmation screen — reachable from
				// `SpacesIndex`'s "Join a space" CTA, the command palette, and
				// (pre-filled) a `soma://invite/...` deep link via
				// `components/deep-link/deep-link-listener.tsx`. Flat, not
				// space-scoped: the whole point is that the user doesn't know
				// which space they're joining until `inspect()` tells them.
				path: "join",
				Component: JoinSpacePage,
				errorElement: <RouteErrorBoundary />,
			},
			{
				path: "spaces/:spaceId",
				Component: SpaceView,
				errorElement: <RouteErrorBoundary />,
			},
			{
				path: "spaces/:spaceId/pages/:pageId",
				Component: PageView,
				errorElement: <RouteErrorBoundary />,
			},
			{
				path: "spaces/:spaceId/practice",
				Component: PracticePage,
				errorElement: <RouteErrorBoundary />,
			},
			{
				path: "spaces/:spaceId/settings",
				Component: SpaceSettingsPage,
				errorElement: <RouteErrorBoundary />,
			},
			{
				path: "spaces/:spaceId/members",
				loader: spaceMembersRedirectLoader,
				Component: () => null,
			},
			{
				// Flat convenience path — see `practiceRedirectLoader` above.
				path: "practice",
				loader: practiceRedirectLoader,
				Component: () => null,
			},
			{
				path: "settings",
				Component: SettingsPage,
				errorElement: <RouteErrorBoundary />,
			},
			{
				path: "spike/editor",
				Component: SpikeEditor,
				errorElement: <RouteErrorBoundary />,
			},
			{
				path: "*",
				Component: NotFound,
			},
		],
	},
];

export const router = isTauri() ? createMemoryRouter(routes, { initialEntries: ["/"] }) : createBrowserRouter(routes);
