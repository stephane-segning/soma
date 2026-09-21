/**
 * useWindowTitle — reflects the active space/page in both the document
 * title (browser-tab title under the `httpTransport` web build) and the
 * native OS window title (Tauri only — Cmd-Tab / Mission Control / Dock
 * all read the *window* title, never `document.title`).
 *
 * Mounted once from `AppLayout` (the router's root layout route), so it
 * re-runs on every navigation via `useLocation()`. `AppLayout` renders
 * as the actual matched route there, but the space/page ids still come
 * from `parseActiveSpaceId` / `parseActivePageId` rather than
 * `useParams()` — those only resolve params owned by *this exact* route
 * match, and `AppLayout`'s own route (`"/"`) never carries `:spaceId`
 * or `:pageId` itself (those belong to nested child routes). Parsing
 * the pathname directly sidesteps that and matches the pattern already
 * used by `SpacesRailContainer` / `NavPanel` / `CommandPaletteRoot`.
 *
 * Two independent targets:
 *  - `document.title` — works everywhere (Tauri webview and the plain
 *    browser build alike). Always applied.
 *  - The native window title (Tauri only) — via `@tauri-apps/api/window`'s
 *    own `setTitle`, NOT the app's `window_control` Tauri command (that
 *    surface only has minimize/toggleMaximize/close — no title-setting
 *    action, and `desktop-commands`/`src-tauri` are out of scope for
 *    this change). This call additionally needs the
 *    `core:window:allow-set-title` capability, which is not yet granted
 *    in `desktop-app/src-tauri/capabilities/default.json` (confirmed by
 *    inspecting `src-tauri/gen/schemas/acl-manifests.json`: the
 *    `core:window` default permission set includes `allow-title` (read)
 *    but not `allow-set-title`). Until that one-line capability grant
 *    lands — `src-tauri` is owned by a concurrent agent, out of scope
 *    here — this call fails closed: caught, logged once per attempt,
 *    never thrown, so it can't crash navigation. `document.title` is
 *    unaffected by that gap and takes effect today.
 *
 * The title-formatting logic itself lives in `./window-title-format`
 * (pure, no imports) rather than inline here — see that file's doc
 * comment for why importing `./backend` matters for testability.
 *
 * Staying live on the open page: `resolveTitle` alone only re-runs on
 * navigation (the effect's `[pathname, appTitle]` deps), so a title
 * `page-view.tsx` derives from the heading *while the user stays on
 * that page* wouldn't otherwise be picked up until the next route
 * change. Rather than a second poll/timer, this also subscribes to the
 * same `pages-changed` domain event `PagesPanel` reacts to
 * (`documents_update_page_title` publishes it — see
 * `desktop-api/src/documents.rs`) and re-resolves on a match for the
 * active space. `pages-changed` doesn't carry a `pageId`, so the match
 * is space-scoped, same as `PagesPanel`'s; `resolveTitle` below already
 * no-ops back to `appTitle`/the bare space name when `pageId` isn't in
 * the freshly re-fetched list.
 *
 * Because a domain event can retrigger `resolveTitle` while the initial
 * call (or a previous event's call) is still in flight, `apply` is
 * guarded by a "latest request wins" id below — same stale-response
 * hazard, and same fix, as `PagesPanel`'s `load()`.
 */
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { parseActivePageId, parseActiveSpaceId } from "./active-space";
import { backend } from "./backend";
import { formatWindowTitle } from "./window-title-format";

export function useWindowTitle(appTitle: string): void {
	const { pathname } = useLocation();

	useEffect(() => {
		let cancelled = false;
		let latestRequestId = 0;
		const spaceId = parseActiveSpaceId(pathname);
		const pageId = parseActivePageId(pathname);

		async function resolveTitle(): Promise<string> {
			if (!spaceId) return appTitle;

			let spaceName: string | null = null;
			try {
				const space = await backend.spaces.get(spaceId);
				spaceName = space?.displayName ?? null;
			} catch (err) {
				console.error("[window-title] spaces.get failed", err);
			}

			let pageTitle: string | null = null;
			if (pageId && spaceName) {
				try {
					const pages = await backend.pages.list(spaceId);
					pageTitle = pages.find((page) => page.pageId === pageId)?.title ?? null;
				} catch (err) {
					console.error("[window-title] pages.list failed", err);
				}
			}

			return formatWindowTitle({ appTitle, pageTitle, spaceName });
		}

		function apply(requestId: number, title: string) {
			if (cancelled || requestId !== latestRequestId) return;

			document.title = title;

			if (isTauri()) {
				getCurrentWindow()
					.setTitle(title)
					.catch((err: unknown) => {
						console.error(
							"[window-title] native setTitle failed — needs core:window:allow-set-title in " +
								"desktop-app/src-tauri/capabilities/default.json",
							err,
						);
					});
			}
		}

		function refresh() {
			const requestId = ++latestRequestId;
			void resolveTitle().then((title) => apply(requestId, title));
		}

		refresh();

		const unsubscribe = spaceId
			? backend.events.onDomain((event) => {
					if (event.kind === "pages-changed" && event.spaceId === spaceId) refresh();
				})
			: undefined;

		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [pathname, appTitle]);
}
