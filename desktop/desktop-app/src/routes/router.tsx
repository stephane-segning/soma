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
import { Empty } from "@soma/ui/components/primitives/empty";
import { useTranslation } from "react-i18next";
import type { RouteObject } from "react-router";
import { createMemoryRouter, useParams } from "react-router";
import { AppLayout } from "./app-layout";
import { NotFound } from "./not-found";
import { PageView } from "./page-view";
import { rootRedirectLoader } from "./root-redirect";
import { SettingsPage } from "./settings";
import { SpaceView } from "./space-view";
import { SpacesIndex } from "./spaces-index";
import { SpikeEditor } from "./spike-editor";

/**
 * Lightweight placeholder routes for the per-space `members` and `info`
 * surfaces. The real screens land alongside the membership and join-
 * decision flows; until then we render an `Empty` so the deep links
 * from chips and breadcrumbs still resolve to something coherent.
 */
function SpaceMembersPlaceholder() {
	const { t } = useTranslation();
	const { spaceId } = useParams<{ spaceId: string }>();
	return (
		<main className="mx-auto w-full max-w-4xl px-8 py-10">
			<Empty
				headline={t("pages.space_members.placeholder")}
				subtext={spaceId ? <span className="font-mono text-xs">{spaceId}</span> : undefined}
			/>
		</main>
	);
}

function SpaceInfoPlaceholder() {
	const { t } = useTranslation();
	const { spaceId } = useParams<{ spaceId: string }>();
	return (
		<main className="mx-auto w-full max-w-4xl px-8 py-10">
			<Empty
				headline={t("pages.space_info.placeholder")}
				subtext={spaceId ? <span className="font-mono text-xs">{spaceId}</span> : undefined}
			/>
		</main>
	);
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
				path: "spaces/:spaceId/members",
				Component: SpaceMembersPlaceholder,
			},
			{
				path: "spaces/:spaceId/info",
				Component: SpaceInfoPlaceholder,
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

export const router = createMemoryRouter(routes, { initialEntries: ["/"] });
