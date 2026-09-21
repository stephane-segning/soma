/**
 * CommandPaletteRoot — global ⌘K palette mounted once at the React
 * root, and the mount point for the whole shortcut registry
 * (`../../lib/shortcuts`).
 *
 * Owns the command registry the renderer cares about today: navigation
 * jumps for the routes we have (`/spaces`, `/settings`, `/spike/editor`)
 * plus the real creation / toggle commands (`New Page`, `New Space`,
 * `Toggle Spaces Rail`, `Toggle Chat Sidebar`).
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
import { useMemo } from "react";
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
	| "new-page"
	| "new-space"
	| "toggle-spaces-rail"
	| "toggle-chat-sidebar";

export function CommandPaletteRoot() {
	const { open, setOpen, toggle } = useCommandPalette();
	const { t } = useTranslation();
	const shellControls = useShellControls();

	useTauriMenuBridge();

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
			"new-page": () => {
				void newPage();
			},
			"new-space": () => {
				void newSpace();
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
	const items = useMemo<CommandPaletteItem[]>(() => {
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
			make("open-editor-probe", t("palette.commands.open_editor_probe"), "commands"),
			make("new-page", t("palette.commands.new_page"), "commands", "new-page"),
			make("new-space", t("palette.commands.new_space"), "commands", "new-space"),
			make("toggle-spaces-rail", t("palette.commands.toggle_spaces_rail"), "commands", "toggle-spaces-rail"),
			make("toggle-chat-sidebar", t("palette.commands.toggle_chat_sidebar"), "commands", "toggle-chat-sidebar"),
		];
	}, [platform, runners, setOpen, t]);

	return (
		<CommandPalette items={items} onClose={() => setOpen(false)} open={open} placeholder={t("palette.placeholder")} />
	);
}
