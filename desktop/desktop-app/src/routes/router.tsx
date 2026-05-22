/**
 * Tauri V2 shell router — Phase 1 foundation.
 *
 * Stubs the route tree we need for the desktop shell rebuild: a top-level
 * `app-layout` that owns the 3-column `DesktopShell`, with nested
 * placeholder routes for `/spaces`, `/spaces/:spaceId`, `/settings`,
 * and a `/spike/editor` page that preserves the original Tauri-on-
 * WKWebView focus probe from the smoke-test App.
 *
 * Real space data, the right-column chat sidebar, command palette,
 * tabs bar, splash, and deep-link landing are deferred to later phases.
 */
import { createBrowserRouter } from "react-router";
import { AppLayout } from "./app-layout";
import { NotFound } from "./not-found";
import { rootRedirectLoader } from "./root-redirect";
import { SettingsPage } from "./settings";
import { SpaceView } from "./space-view";
import { SpacesIndex } from "./spaces-index";
import { SpikeEditor } from "./spike-editor";

export const router = createBrowserRouter([
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
]);
