/**
 * parseActiveSpaceId — "what space is the user currently in", derived
 * from the live route rather than a second, parallel store.
 *
 * `SpacesRailContainer` already treats the `:spaceId` route param as
 * the active space (`useParams<{ spaceId }>()`, used for
 * `<SpacesRail activeId={spaceId} />`). Commands that can run from
 * *outside* a rendered route component — the native-menu bridge, the
 * global keyboard shortcut, the command palette — need the same
 * answer but can't call a hook, so `CommandPaletteRoot` calls this
 * with `router.state.location.pathname` (the same router singleton
 * `router.navigate(...)` already uses there) instead of a store that
 * could drift from what the rail shows.
 *
 * Deliberately takes the pathname as a plain string rather than
 * importing the `router` singleton itself: `router.tsx` transitively
 * pulls in every route component (and their DOM/CSS/Tauri-plugin
 * imports), which would make this otherwise-pure function untestable
 * under a plain Node test runner.
 */

const SPACE_ID_PATTERN = /^\/spaces\/([^/]+)(?:\/|$)/;

/** `null` when `pathname` isn't inside any `/spaces/:spaceId/...` subtree (e.g. `/spaces`, `/settings`). */
export function parseActiveSpaceId(pathname: string): string | null {
	const match = SPACE_ID_PATTERN.exec(pathname);
	if (!match) return null;
	return decodeURIComponent(match[1]);
}

const PAGE_ID_PATTERN = /^\/spaces\/[^/]+\/pages\/([^/]+)(?:\/|$)/;

/**
 * Same idea as `parseActiveSpaceId`, one level deeper: "what page is the
 * user currently looking at", derived from the route rather than a
 * second store. `null` outside `/spaces/:spaceId/pages/:pageId`.
 *
 * Added for `useWindowTitle` (`use-window-title.ts`), which — like the
 * command palette / shortcut registry — needs this from places that
 * aren't always a rendered `PageView` with `useParams()` available.
 */
export function parseActivePageId(pathname: string): string | null {
	const match = PAGE_ID_PATTERN.exec(pathname);
	if (!match) return null;
	return decodeURIComponent(match[1]);
}
