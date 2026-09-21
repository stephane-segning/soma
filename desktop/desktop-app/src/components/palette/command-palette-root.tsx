/**
 * CommandPaletteRoot — global ⌘K palette mounted once at the React
 * root, and the mount point for the whole shortcut registry
 * (`../../lib/shortcuts`).
 *
 * Owns the command registry the renderer cares about today: navigation
 * jumps for the routes we have (`/spaces`, `/settings`, `/spike/editor`,
 * `/practice`) plus the real creation / toggle commands (`New Page`,
 * `New Space`, `Toggle Spaces Rail`, `Toggle Chat Sidebar`) — and, as of
 * this pass, the `spaces` and `documents` sections the `CommandPalette`
 * primitive has always supported but nothing ever populated:
 *
 *  - `spaces` — every space, via `backend.spaces.list` (same call +
 *    shape `SpacesRailContainer` already uses), refreshed on the same
 *    `join-decision` domain event that rail listens for.
 *  - `documents` — the *active* space's pages, via `backend.pages.list`,
 *    refetched each time the palette opens (cheap local call; simpler
 *    and always-fresh beats caching a second copy of "current space").
 *    There is deliberately no cross-space "recent docs" section: that
 *    would need either a recency-tracking mechanism this app doesn't
 *    have, or fetching every space's every page up front — and
 *    `backend.search`'s handler is a stub that always returns `[]`
 *    (`desktop-api/src/search.rs`), so it isn't a real data source
 *    either. `onQueryChange` (the hook the primitive exposes for a
 *    server-driven query) stays unused for the same reason: wiring it
 *    to `search` would make the palette *look* smarter while always
 *    returning nothing, which is worse than the honest, narrower scope
 *    here. The existing client-side filter (already in the primitive)
 *    covers substring search across whatever real `items` are passed.
 *
 * Reacts to three input sources, all funneled through `useShortcuts`:
 *
 *   - The ⌘K / Ctrl+K chord — toggles `useCommandPalette()`'s `open`.
 *   - The raw `keydown` chords for the other commands (⌘N, ⌘⇧N, ⌘/, ⌘⇧/).
 *   - The native menu, bridged from `app:menu-action` by
 *     `useTauriMenuBridge` into the same event `useShortcuts` listens
 *     for — so a menu click and a keyboard chord run the identical
 *     command function.
 *
 * `useShortcuts` itself handles focus-awareness (chords ignored while
 * typing, except the ones marked `"global"`) and de-duplication (a
 * menu click that also reaches the webview's `keydown` handler runs
 * the command once, not twice) — this component just supplies *what*
 * runs for each id.
 *
 * "Toggle Spaces Rail" / "Toggle Chat Sidebar" call into
 * `useShellControls()` (`../../lib/shell-controls`), which
 * `routes/app-layout.tsx` publishes its real `leftExpanded` /
 * `rightExpanded` toggles into on mount — no forked state, no direct
 * prop path (this component is mounted as a sibling of
 * `<RouterProvider />`, so it can't reach `AppLayout` any other way).
 *
 * "New Page" / "New Space" resolve the active space from the live
 * route (`activeSpaceId()`), perform the SDK calls, and navigate. On
 * failure they navigate to the nearest sensible landing route with an
 * inline `notice` in router state (ADR-0005 §6 — no toast-only
 * feedback) — `SpaceView` / `SpacesIndex` read it via
 * `useNavigationNotice()`.
 */

import { CommandPalette, type CommandPaletteItem } from "@soma/ui/components/overlays/command-palette";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseActiveSpaceId } from "../../lib/active-space";
import { backend } from "../../lib/backend";
import { createPage } from "../../lib/create-page";
import { useShellControls } from "../../lib/shell-controls";
import { detectPlatform, formatShortcut, type ShortcutId, shortcutFor, useShortcuts } from "../../lib/shortcuts";
import { useTauriMenuBridge } from "../../lib/shortcuts/tauri-menu-bridge";
import { router } from "../../routes/router";
import { useCommandPalette } from "./use-command-palette";

type CommandId =
	| "go-to-spaces"
	| "go-to-settings"
	| "open-editor-probe"
	| "go-to-practice"
	| "new-page"
	| "new-space"
	| "join-space"
	| "toggle-spaces-rail"
	| "toggle-chat-sidebar";

/** Mirrors `SpacesRailContainer`'s own ceiling — see its doc comment. */
const SPACES_LIST_LIMIT = 1000;
/** Domain-event kinds that can change the space inventory (same set `SpacesRailContainer` reacts to). */
const SPACE_LIST_AFFECTING: ReadonlySet<string> = new Set(["join-decision"]);

/** Populated once on mount (+ refreshed on `join-decision`), independent of `open` — cheap, and having it ready the instant the palette opens avoids a first-keystroke flash of an empty "Spaces" section. */
function useSpaceItems(onSelect: (spaceId: string) => void): CommandPaletteItem[] {
	const [items, setItems] = useState<CommandPaletteItem[]>([]);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const result = await backend.spaces.list({ limit: SPACES_LIST_LIMIT, q: null });
				if (cancelled) return;
				setItems(
					result.spaces.map((space) => ({
						id: `space-${space.spaceId}`,
						onSelect: () => onSelect(space.spaceId),
						section: "spaces" as const,
						title: space.displayName,
					})),
				);
			} catch (err) {
				console.error("[command-palette] spaces.list failed", err);
			}
		}
		void load();
		const unsubscribe = backend.events.onDomain((event) => {
			if (SPACE_LIST_AFFECTING.has(event.kind)) void load();
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
		// `onSelect` is expected to be a `useCallback`-stable function from
		// the caller (see `CommandPaletteRoot`'s `selectSpace`) — including
		// it keeps this exhaustive without resubscribing on every render.
	}, [onSelect]);

	return items;
}

/** Refetched every time the palette opens, scoped to whichever space is active *at that moment* — see the file-level doc comment for why this (not a global "recent docs") is the honest scope for "documents". */
function useDocumentItems(
	open: boolean,
	onSelect: (spaceId: string, pageId: string) => void,
	untitled: string,
): CommandPaletteItem[] {
	const [items, setItems] = useState<CommandPaletteItem[]>([]);

	useEffect(() => {
		if (!open) return;
		const spaceId = parseActiveSpaceId(router.state.location.pathname);
		if (!spaceId) {
			setItems([]);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const pages = await backend.pages.list(spaceId);
				if (cancelled) return;
				setItems(
					pages.map((page) => ({
						id: `page-${spaceId}-${page.pageId}`,
						onSelect: () => onSelect(spaceId, page.pageId),
						section: "documents" as const,
						title: page.title || untitled,
					})),
				);
			} catch (err) {
				console.error("[command-palette] pages.list failed", err);
				if (!cancelled) setItems([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, onSelect, untitled]);

	return items;
}

export function CommandPaletteRoot() {
	const { open, setOpen, toggle } = useCommandPalette();
	const { t } = useTranslation();
	const shellControls = useShellControls();

	useTauriMenuBridge();

	// Stable across renders (empty deps — `router.navigate` is the
	// module-level singleton, not a hook value) so `useSpaceItems` /
	// `useDocumentItems` above don't resubscribe on every render.
	const selectSpace = useCallback((spaceId: string) => {
		void router.navigate(`/spaces/${spaceId}`);
	}, []);
	const selectDocument = useCallback((spaceId: string, pageId: string) => {
		void router.navigate(`/spaces/${spaceId}/pages/${pageId}`);
	}, []);
	const untitledLabel = t("pages.untitled");
	const spaceItems = useSpaceItems(selectSpace);
	const documentItems = useDocumentItems(open, selectDocument, untitledLabel);

	// We use the imperative `router.navigate(...)` instead of
	// `useNavigate()` because the palette is mounted at the React root
	// (a sibling of `<RouterProvider />`), where the router context
	// isn't available. The behaviour is identical — same router
	// instance, same `createMemoryRouter` history — just without the
	// hook wrapper.
	const runners = useMemo<Record<CommandId, () => void>>(() => {
		const newPage = async () => {
			const spaceId = parseActiveSpaceId(router.state.location.pathname);
			if (!spaceId) {
				void router.navigate("/spaces", {
					state: {
						notice: t("pages.spaces_index.need_space_for_page", "Pick or create a space before adding a page."),
					},
				});
				return;
			}
			try {
				const page = await createPage(spaceId, t("pages.untitled", "Untitled"));
				void router.navigate(`/spaces/${spaceId}/pages/${page.pageId}`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				void router.navigate(`/spaces/${spaceId}`, {
					state: { notice: t("panels.pages.create_error", "Couldn't create page: {{message}}", { message }) },
				});
			}
		};

		const newSpace = async () => {
			try {
				const space = await backend.spaces.create(null);
				void router.navigate(`/spaces/${space.spaceId}`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				void router.navigate("/spaces", {
					state: {
						notice: t("pages.spaces_index.create_error", "Couldn't create a space: {{message}}", { message }),
					},
				});
			}
		};

		return {
			"go-to-spaces": () => {
				void router.navigate("/spaces");
			},
			"go-to-settings": () => {
				void router.navigate("/settings");
			},
			"open-editor-probe": () => {
				void router.navigate("/spike/editor");
			},
			"go-to-practice": () => {
				// Resolve the active space directly when there is one, so
				// this doesn't pay for a redirect round-trip through the
				// `/practice` convenience route (`routes/router.tsx`'s
				// `practiceRedirectLoader`) — that loader exists for
				// deep-links/bookmarks, not for a command that already knows
				// the current space.
				const spaceId = parseActiveSpaceId(router.state.location.pathname);
				void router.navigate(spaceId ? `/spaces/${spaceId}/practice` : "/practice");
			},
			"new-page": () => {
				void newPage();
			},
			"new-space": () => {
				void newSpace();
			},
			"join-space": () => {
				void router.navigate("/join");
			},
			"toggle-spaces-rail": () => {
				shellControls.toggleSpacesRail();
			},
			"toggle-chat-sidebar": () => {
				shellControls.toggleChatSidebar();
			},
		};
	}, [shellControls, t]);

	// The single keydown + menu-bridge listener for the whole app. See
	// `lib/shortcuts/use-shortcuts.ts` for focus-awareness + dedup.
	useShortcuts({
		"open-palette": toggle,
		"new-page": runners["new-page"],
		"new-space": runners["new-space"],
		"toggle-spaces-rail": runners["toggle-spaces-rail"],
		"toggle-chat-sidebar": runners["toggle-chat-sidebar"],
	});

	// Wrap every command so picking it closes the overlay as well. The
	// `CommandPalette` component already calls `onClose` on click, but
	// callers that fire commands programmatically (menu bar, shortcut)
	// should not depend on that.
	const platform = useMemo(() => detectPlatform(), []);
	const commandItems = useMemo<CommandPaletteItem[]>(() => {
		const make = (
			id: CommandId,
			title: string,
			section: CommandPaletteItem["section"],
			shortcutId?: ShortcutId,
		): CommandPaletteItem => ({
			id,
			title,
			section,
			shortcut: shortcutId ? formatShortcut(shortcutFor(shortcutId).chord, platform) : undefined,
			onSelect: () => {
				runners[id]();
				setOpen(false);
			},
		});

		return [
			make("go-to-spaces", t("palette.commands.go_to_spaces"), "commands"),
			make("go-to-settings", t("palette.commands.go_to_settings"), "commands"),
			make("go-to-practice", t("palette.commands.go_to_practice"), "commands"),
			make("open-editor-probe", t("palette.commands.open_editor_probe"), "commands"),
			make("new-page", t("palette.commands.new_page"), "commands", "new-page"),
			make("new-space", t("palette.commands.new_space"), "commands", "new-space"),
			make("join-space", t("palette.commands.join_space"), "commands"),
			make("toggle-spaces-rail", t("palette.commands.toggle_spaces_rail"), "commands", "toggle-spaces-rail"),
			make("toggle-chat-sidebar", t("palette.commands.toggle_chat_sidebar"), "commands", "toggle-chat-sidebar"),
		];
	}, [platform, runners, setOpen, t]);

	// Section order is the primitive's own job (`CommandPalette` groups
	// by `item.section` regardless of input order) — concatenating here
	// is just "all the items that currently exist".
	const allItems = useMemo(
		() => [...documentItems, ...spaceItems, ...commandItems],
		[documentItems, spaceItems, commandItems],
	);

	return (
		<CommandPalette
			items={allItems}
			onClose={() => setOpen(false)}
			open={open}
			placeholder={t("palette.placeholder")}
		/>
	);
}
