/**
 * chords — the single source of truth for the app's keyboard shortcuts.
 *
 * Every chord the shell reacts to (native menu accelerator, in-page
 * `keydown`, or command-palette entry) is declared exactly once here.
 * `use-shortcuts.ts` (the renderer-side `keydown` matcher) and
 * `command-palette-root.tsx` (the palette's shortcut hints) both read
 * from `SHORTCUTS` instead of hardcoding chords in more than one place.
 *
 * `menuActionId` links a shortcut to the matching native-menu item id
 * (see `desktop-app/src-tauri/src/startup/menu.rs`). Not every shortcut
 * has one — `open-palette` (⌘K) is renderer-only, there is no menu item
 * for it.
 */

export type ShortcutScope =
	/** Fires even while focus is inside an `<input>` / `<textarea>` / contenteditable (the editor). */
	| "global"
	/** Suppressed while focus is inside an `<input>` / `<textarea>` / contenteditable. */
	| "focus-aware";

export type Chord = {
	/** `KeyboardEvent.key`, compared case-insensitively. */
	key: string;
	/** CmdOrCtrl — ⌘ on mac, Ctrl elsewhere. Every shortcut in this app carries it. */
	mod: true;
	shift?: boolean;
};

/**
 * Menu-item ids the Rust menu bridge emits (see
 * `src-tauri/src/startup/menu.rs`, `pub mod ids`). Only the ids the
 * renderer actually reacts to belong here — `menu:reload`,
 * `menu:toggle-devtools`, and `menu:help-docs` are handled entirely on
 * the Rust side and never reach the renderer.
 */
export type MenuActionId = "menu:new-page" | "menu:new-space" | "menu:toggle-spaces-rail" | "menu:toggle-chat-sidebar";

const MENU_ACTION_IDS: ReadonlySet<MenuActionId> = new Set<MenuActionId>([
	"menu:new-page",
	"menu:new-space",
	"menu:toggle-spaces-rail",
	"menu:toggle-chat-sidebar",
]);

export function isMenuActionId(value: string): value is MenuActionId {
	return MENU_ACTION_IDS.has(value as MenuActionId);
}

export type ShortcutId = "open-palette" | "new-page" | "new-space" | "toggle-spaces-rail" | "toggle-chat-sidebar";

export type ShortcutDefinition = {
	id: ShortcutId;
	chord: Chord;
	scope: ShortcutScope;
	/** The native-menu item this chord mirrors, if any (see module docstring). */
	menuActionId?: MenuActionId;
};

/**
 * `open-palette` and `new-page` are marked `"global"` per the product
 * requirement: ⌘K and ⌘N must still work while the caret is inside the
 * TipTap editor (or any input). Everything else — including ⌘⇧N — is
 * `"focus-aware"` and yields to normal typing. This matters in
 * particular for ⌘/ : it's a common "toggle comment" chord in code
 * surfaces, so letting it fall through to typing rather than hijacking
 * focus is the safer default.
 */
export const SHORTCUTS: readonly ShortcutDefinition[] = [
	{ id: "open-palette", chord: { key: "k", mod: true }, scope: "global" },
	{ id: "new-page", chord: { key: "n", mod: true }, scope: "global", menuActionId: "menu:new-page" },
	{
		id: "new-space",
		chord: { key: "n", mod: true, shift: true },
		scope: "focus-aware",
		menuActionId: "menu:new-space",
	},
	{
		id: "toggle-spaces-rail",
		chord: { key: "/", mod: true },
		scope: "focus-aware",
		menuActionId: "menu:toggle-spaces-rail",
	},
	{
		id: "toggle-chat-sidebar",
		chord: { key: "/", mod: true, shift: true },
		scope: "focus-aware",
		menuActionId: "menu:toggle-chat-sidebar",
	},
];

const BY_MENU_ACTION_ID = new Map<MenuActionId, ShortcutDefinition>(
	SHORTCUTS.filter(
		(def): def is ShortcutDefinition & { menuActionId: MenuActionId } => def.menuActionId !== undefined,
	).map((def) => [def.menuActionId, def]),
);

export function shortcutForMenuAction(menuActionId: MenuActionId): ShortcutDefinition | undefined {
	return BY_MENU_ACTION_ID.get(menuActionId);
}

export function shortcutFor(id: ShortcutId): ShortcutDefinition {
	// biome-ignore lint/style/noNonNullAssertion: SHORTCUTS carries exactly one definition per ShortcutId, enforced by the exhaustive union above.
	return SHORTCUTS.find((def) => def.id === id)!;
}

/**
 * Internal cross-component bus event. The Tauri menu bridge
 * (`tauri-menu-bridge.ts`) dispatches this after translating a native
 * `app:menu-action` event; `use-shortcuts.ts` treats it as equivalent
 * to the matching chord's `keydown`. Kept as a plain `CustomEvent` on
 * `window` (rather than a new context) so it works identically whether
 * or not the Tauri bridge is mounted.
 */
export const SHORTCUT_ACTION_EVENT = "soma:command-palette-action";

export type ShortcutActionDetail = {
	id: MenuActionId;
};
