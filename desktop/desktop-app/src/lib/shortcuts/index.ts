/**
 * Public surface of the shortcut registry. Import from here (not the
 * individual files) outside this directory, except for
 * `tauri-menu-bridge.ts` — it's intentionally imported directly by the
 * one call site that mounts it, keeping every other consumer free of
 * the `@tauri-apps/*` dependency it carries.
 */
export {
	type Chord,
	isMenuActionId,
	type MenuActionId,
	SHORTCUT_ACTION_EVENT,
	SHORTCUTS,
	type ShortcutActionDetail,
	type ShortcutDefinition,
	type ShortcutId,
	type ShortcutScope,
	shortcutFor,
	shortcutForMenuAction,
} from "./chords";
export {
	type DispatchEventLike,
	detectPlatform,
	eventMatchesChord,
	formatShortcut,
	isEditableTarget,
	type Platform,
	resolveShortcut,
} from "./matcher";
export { type ShortcutHandlers, useShortcuts } from "./use-shortcuts";
