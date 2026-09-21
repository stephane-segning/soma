/**
 * useShortcuts — the renderer-side half of the shortcut registry.
 *
 * Mounted once at the app root (`CommandPaletteRoot`). No
 * `@tauri-apps/*` import here on purpose: this hook has to work
 * identically in a plain browser tab and on Tauri mobile, neither of
 * which has a native menu bar. The Tauri desktop menu is bridged in
 * separately (see `tauri-menu-bridge.ts`) as an *equivalent* trigger,
 * not a dependency — with the bridge unmounted, every shortcut still
 * works from the raw `keydown` path below.
 *
 * Two trigger sources feed the same dispatch:
 *   1. A `document`-level `keydown` listener matched against
 *      `SHORTCUTS` (chords.ts), gated by `isEditableTarget` for
 *      `"focus-aware"` entries.
 *   2. The `SHORTCUT_ACTION_EVENT` `CustomEvent` — dispatched by the
 *      Tauri menu bridge after a native menu click, or by anything
 *      else that wants to trigger a shortcut's command programmatically.
 *
 * De-duplication: a native menu accelerator press can, depending on
 * platform/webview, also reach the webview's own `keydown` handler (the
 * OS doesn't guarantee the menu "swallows" the key event before it
 * reaches the focused webview). If both the `keydown` path and the
 * menu-bridge path fire for the same logical action within a short
 * window, only the first one actually runs the handler.
 */
import { useEffect, useRef } from "react";
import { SHORTCUT_ACTION_EVENT, SHORTCUTS, type ShortcutActionDetail, type ShortcutId } from "./chords";
import { resolveShortcut } from "./matcher";

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

/** Two triggers for the same chord arriving this close together count as one user action. */
const DEDUP_WINDOW_MS = 400;

export function useShortcuts(handlers: ShortcutHandlers): void {
	const handlersRef = useRef(handlers);
	useEffect(() => {
		handlersRef.current = handlers;
	}, [handlers]);

	useEffect(() => {
		const lastRunAtById = new Map<ShortcutId, number>();

		function run(id: ShortcutId) {
			const handler = handlersRef.current[id];
			if (!handler) return;
			const now = Date.now();
			const lastRunAt = lastRunAtById.get(id) ?? 0;
			if (now - lastRunAt < DEDUP_WINDOW_MS) return;
			lastRunAtById.set(id, now);
			handler();
		}

		function onKeyDown(event: KeyboardEvent) {
			// The whole decision (auto-repeat, already-consumed, focus-aware
			// gating) lives in `resolveShortcut` so it's unit-testable without
			// a DOM — see `matcher.ts` for the ordering and why each rule exists.
			const def = resolveShortcut(event, event.target as HTMLElement | null, SHORTCUTS);
			if (!def) return;
			event.preventDefault();
			run(def.id);
		}

		function onShortcutAction(event: Event) {
			const detail = (event as CustomEvent<ShortcutActionDetail>).detail;
			if (!detail) return;
			const def = SHORTCUTS.find((candidate) => candidate.menuActionId === detail.id);
			if (!def) return;
			run(def.id);
		}

		document.addEventListener("keydown", onKeyDown);
		window.addEventListener(SHORTCUT_ACTION_EVENT, onShortcutAction);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener(SHORTCUT_ACTION_EVENT, onShortcutAction);
		};
	}, []);
}
