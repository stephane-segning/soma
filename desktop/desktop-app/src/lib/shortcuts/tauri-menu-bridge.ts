/**
 * useTauriMenuBridge — the only `@tauri-apps/*`-dependent piece of the
 * shortcut registry, kept in its own module by design (see
 * `use-shortcuts.ts`'s docstring) so the registry core stays runnable
 * outside Tauri (plain browser, Tauri mobile with no menu bar).
 *
 * Listens for the native menu's `app:menu-action` Tauri event (emitted
 * by `desktop-app/src-tauri/src/startup/menu.rs` via
 * `desktop_core::events::MENU_EVENT`, payload = the bare menu-id
 * string) and re-dispatches it as the generic `SHORTCUT_ACTION_EVENT`
 * `CustomEvent` that `useShortcuts` already listens for. This is the
 * *only* thing this module does — command execution lives in
 * `useShortcuts` / `CommandPaletteRoot`, not here.
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { isMenuActionId, SHORTCUT_ACTION_EVENT, type ShortcutActionDetail } from "./chords";

const MENU_ACTION_TAURI_EVENT = "app:menu-action";

export function useTauriMenuBridge(): void {
	useEffect(() => {
		let cancelled = false;
		let unlisten: UnlistenFn | undefined;

		void listen<string>(MENU_ACTION_TAURI_EVENT, (event) => {
			const id = event.payload;
			if (typeof id !== "string" || !isMenuActionId(id)) {
				console.warn("[shortcuts] unknown app:menu-action id", id);
				return;
			}
			const detail: ShortcutActionDetail = { id };
			window.dispatchEvent(new CustomEvent<ShortcutActionDetail>(SHORTCUT_ACTION_EVENT, { detail }));
		})
			.then((fn) => {
				if (cancelled) {
					fn();
					return;
				}
				unlisten = fn;
			})
			.catch((err) => {
				// Outside the Tauri runtime (plain Vite preview, or a future
				// web/mobile build) the IPC bridge simply isn't there — log
				// once and carry on. Every shortcut still works via the raw
				// `keydown` path in `use-shortcuts.ts`.
				console.warn("[shortcuts] failed to subscribe to app:menu-action", err);
			});

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, []);
}
