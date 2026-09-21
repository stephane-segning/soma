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
import { AppLayout } from "./app-layout";
import { NotFound } from "./not-found";
import { PageView } from "./page-view";
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

const routes: RouteObject[] = [
	{
		path: "/",
		Component: AppLayout,
		children: [
			{
				index: true,
				loader: rootRedirectLoader,
				Component: () => null,
			},
			{
				path: "spaces",
				Component: SpacesIndex,
			},
			{
				path: "spaces/:spaceId",
				Component: SpaceView,
			},
			{
				path: "spaces/:spaceId/pages/:pageId",
				Component: PageView,
			},
			{
				path: "spaces/:spaceId/settings",
				Component: SpaceSettingsPage,
			},
			{
				path: "spaces/:spaceId/members",
				loader: spaceMembersRedirectLoader,
				Component: () => null,
			},
			{
				path: "settings",
				Component: SettingsPage,
			},
			{
				path: "spike/editor",
				Component: SpikeEditor,
			},
			{
				path: "*",
				Component: NotFound,
			},
		],
	},
];

export const router = isTauri() ? createMemoryRouter(routes, { initialEntries: ["/"] }) : createBrowserRouter(routes);
