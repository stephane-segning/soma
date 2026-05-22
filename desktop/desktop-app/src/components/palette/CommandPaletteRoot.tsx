/**
 * CommandPaletteRoot — global ⌘K palette mounted once at the React root.
 *
 * Owns the command registry the renderer cares about today: navigation
 * jumps for the routes we have (`/spaces`, `/settings`, `/spike/editor`)
 * and creation TODOs (`New Page`, `New Space`) so the menu-bar items
 * from PR #126 have a renderer-side endpoint even before the real
 * implementations land.
 *
 * Reacts to two input sources:
 *
 *   - `useCommandPalette().open` — driven by the cmd+K hotkey or any
 *     code calling `setOpen(true)`.
 *
 *   - The `soma:command-palette-action` `CustomEvent` forwarded by
 *     `CommandPaletteProvider` after a Tauri `app:menu-action` event.
 *     For creation actions we run the command directly without
 *     opening the overlay (the menu bar already told us *what* to do).
 *
 * The "Toggle Spaces Rail" and "Toggle Chat Sidebar" commands are
 * intentionally stubbed: the rail open state lives in
 * `useDesktopShellState`, which is owned by `routes/app-layout.tsx`.
 * That file is out of scope for this PR — once it exposes a setter on
 * a shell-state context, the two `TODO` callbacks here should call
 * into that setter. Until then the menu items log a warning so the
 * wiring is discoverable.
 */

import { CommandPalette, type CommandPaletteItem } from "@soma/ui/components/overlays/command-palette";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { router } from "../../routes/router";
import { PALETTE_ACTION_EVENT, type PaletteActionDetail, useCommandPalette } from "./use-command-palette";

type CommandId =
	| "go-to-spaces"
	| "go-to-settings"
	| "open-editor-probe"
	| "new-page"
	| "new-space"
	| "toggle-spaces-rail"
	| "toggle-chat-sidebar";

export function CommandPaletteRoot() {
	const { open, setOpen } = useCommandPalette();
	const { t } = useTranslation();

	// We use the imperative `router.navigate(...)` instead of
	// `useNavigate()` because the palette is mounted at the React root
	// (a sibling of `<RouterProvider />`), where the router context
	// isn't available. The behaviour is identical — same router
	// instance, same `createMemoryRouter` history — just without the
	// hook wrapper.
	const runners = useMemo<Record<CommandId, () => void>>(
		() => ({
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
				// TODO(palette): replace with a real page-create flow once the
				// space-aware editor lands. We log instead of silently
				// no-op'ing so this is discoverable in DevTools.
				console.warn("[command-palette] New Page — page creation coming in a follow-up");
			},
			"new-space": () => {
				// TODO(palette): wire to the space-create flow once it exists.
				console.warn("[command-palette] New Space — space creation coming in a follow-up");
			},
			"toggle-spaces-rail": () => {
				// TODO(palette): plumb through `useDesktopShellState` —
				// the toggle setter currently lives inside
				// `desktop-app/src/routes/app-layout.tsx`. When that file
				// exposes a context (or moves the state up here), call
				// the setter from this callback.
				console.warn("[command-palette] Toggle Spaces Rail — pending useDesktopShellState wiring in app-layout.tsx");
			},
			"toggle-chat-sidebar": () => {
				// TODO(palette): same as toggle-spaces-rail — needs a
				// shell-state setter exposed by app-layout.tsx.
				console.warn("[command-palette] Toggle Chat Sidebar — pending useDesktopShellState wiring in app-layout.tsx");
			},
		}),
		[],
	);

	// Bridge for the Tauri `app:menu-action` events forwarded by the
	// provider. Creation actions run "headless" (without opening the
	// palette) because the menu bar already expressed the intent;
	// opening the overlay would be redundant chrome.
	useEffect(() => {
		const onAction = (event: Event) => {
			const detail = (event as CustomEvent<PaletteActionDetail>).detail;
			if (!detail) return;
			switch (detail.id) {
				case "menu:new-page":
					runners["new-page"]();
					return;
				case "menu:new-space":
					runners["new-space"]();
					return;
				case "menu:toggle-spaces-rail":
					runners["toggle-spaces-rail"]();
					return;
				case "menu:toggle-chat-sidebar":
					runners["toggle-chat-sidebar"]();
					return;
				default:
					return;
			}
		};
		window.addEventListener(PALETTE_ACTION_EVENT, onAction);
		return () => {
			window.removeEventListener(PALETTE_ACTION_EVENT, onAction);
		};
	}, [runners]);

	// Wrap every command so picking it closes the overlay as well. The
	// `CommandPalette` component already calls `onClose` on click, but
	// callers that fire commands programmatically (menu bar) should
	// not depend on that.
	const items = useMemo<CommandPaletteItem[]>(() => {
		const make = (
			id: CommandId,
			title: string,
			section: CommandPaletteItem["section"],
			shortcut?: string,
		): CommandPaletteItem => ({
			id,
			title,
			section,
			shortcut,
			onSelect: () => {
				runners[id]();
				setOpen(false);
			},
		});

		return [
			make("go-to-spaces", t("palette.commands.go_to_spaces"), "commands"),
			make("go-to-settings", t("palette.commands.go_to_settings"), "commands"),
			make("open-editor-probe", t("palette.commands.open_editor_probe"), "commands"),
			make("new-page", t("palette.commands.new_page"), "commands", "⌘N"),
			make("new-space", t("palette.commands.new_space"), "commands"),
			make("toggle-spaces-rail", t("palette.commands.toggle_spaces_rail"), "commands", "⌘/"),
			make("toggle-chat-sidebar", t("palette.commands.toggle_chat_sidebar"), "commands"),
		];
	}, [runners, setOpen, t]);

	return (
		<CommandPalette items={items} onClose={() => setOpen(false)} open={open} placeholder={t("palette.placeholder")} />
	);
}
