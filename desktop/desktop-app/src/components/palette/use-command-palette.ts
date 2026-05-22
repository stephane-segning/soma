/**
 * useCommandPalette — open/close state for the global cmd+K command palette.
 *
 * The provider owns a tiny boolean store (`open` + `setOpen`), exposes a
 * `toggle()` helper, and attaches two global side-effects:
 *
 *   1. A `document.keydown` listener that toggles the palette when the user
 *      presses **cmd+K** (mac) or **ctrl+K** (win/linux). We guard on
 *      `!event.repeat` so holding the chord doesn't flicker the overlay.
 *
 *   2. A Tauri `app:menu-action` event listener (see
 *      `desktop-app/src-tauri/src/startup/menu.rs`, which emits via
 *      `desktop_core::events::MENU_EVENT`). The Rust side calls
 *      `app.emit(MENU_EVENT, other)` where `other` is the bare menu-id
 *      `&str` — so the payload arrives as a **string**, not an object.
 *      The id maps to:
 *
 *         - `menu:new-page`            → fire the "New Page" command without
 *                                        opening the palette (TODO toast).
 *         - `menu:new-space`           → fire the "New Space" command without
 *                                        opening the palette (TODO toast).
 *         - `menu:toggle-spaces-rail`  → forwarded as a `palette-action` for
 *                                        AppLayout to wire into
 *                                        `useDesktopShellState` (TODO).
 *         - `menu:toggle-chat-sidebar` → same TODO pattern as the rail.
 *
 *      We dispatch a synthetic `CustomEvent('soma:command-palette-action')`
 *      on `window` so the `CommandPaletteRoot` (which already owns the
 *      command implementations) can react without needing a second context.
 *      The provider is intentionally framework-light: it only owns
 *      open/close. Command execution lives in `CommandPaletteRoot`.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	createContext,
	createElement,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type MenuActionId = "menu:new-page" | "menu:new-space" | "menu:toggle-spaces-rail" | "menu:toggle-chat-sidebar";

/**
 * Tauri menu-event payload shape. The Rust side emits the menu-id as a
 * bare string (`app.emit(MENU_EVENT, other)` in
 * `src-tauri/src/startup/menu.rs`), so the payload is just the id —
 * not an object. Typing it as `string` here keeps the listener honest;
 * we narrow to a `MenuActionId` at the dispatch boundary.
 */
export type MenuActionPayload = string;

const MENU_ACTION_IDS: ReadonlySet<MenuActionId> = new Set<MenuActionId>([
	"menu:new-page",
	"menu:new-space",
	"menu:toggle-spaces-rail",
	"menu:toggle-chat-sidebar",
]);

function isMenuActionId(value: string): value is MenuActionId {
	return MENU_ACTION_IDS.has(value as MenuActionId);
}

/**
 * Internal cross-component bus event name. `CommandPaletteRoot` subscribes
 * to it from a `useEffect` so its command implementations stay co-located
 * with the rest of the palette wiring.
 */
export const PALETTE_ACTION_EVENT = "soma:command-palette-action";

export type PaletteActionDetail = {
	id: MenuActionId;
};

type CommandPaletteContextValue = {
	open: boolean;
	setOpen: (value: boolean) => void;
	toggle: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export type CommandPaletteProviderProps = {
	children: ReactNode;
};

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
	const [open, setOpen] = useState(false);

	const toggle = useCallback(() => {
		setOpen((prev) => !prev);
	}, []);

	// Global cmd+K / ctrl+K hotkey. Attached once for the lifetime of the
	// provider — the cleanup detaches it on unmount.
	//
	// TODO(palette): make this focus-aware — currently the chord fires even
	// when the user is typing in an `<input>` / `contenteditable`, which can
	// surprise editor users mid-keystroke. Track via the Gemini/Codex review
	// on PR #131.
	// TODO(palette): the menu accelerators above are shown as hardcoded ⌘
	// symbols in `CommandPaletteRoot.tsx`; swap for a platform-aware
	// formatter once non-macOS is on the roadmap. Same PR #131 review thread.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat) return;
			if (event.key !== "k" && event.key !== "K") return;
			if (!event.metaKey && !event.ctrlKey) return;
			event.preventDefault();
			setOpen((prev) => !prev);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
		};
	}, []);

	// Tauri menu-bar bridge. The Rust side emits `app:menu-action` with the
	// item id (see `src-tauri/src/startup/menu.rs`). We forward the payload
	// onto a `CustomEvent` so `CommandPaletteRoot` can run the matching
	// command without us needing to know about routing or toasts here.
	//
	// `listen(...)` resolves to an unlisten function; we run it in the
	// effect cleanup. We also guard against the (unlikely) case where the
	// effect unmounts before `listen` resolves by tracking a flag.
	useEffect(() => {
		let cancelled = false;
		let unlisten: UnlistenFn | undefined;

		void listen<MenuActionPayload>("app:menu-action", (event) => {
			// Rust emits the menu-id as a bare string — see
			// `src-tauri/src/startup/menu.rs` (`app.emit(MENU_EVENT, other)`).
			const id = event.payload;
			if (typeof id !== "string" || !isMenuActionId(id)) {
				console.warn("[command-palette] unknown app:menu-action id", id);
				return;
			}
			const detail: PaletteActionDetail = { id };
			window.dispatchEvent(
				new CustomEvent<PaletteActionDetail>(PALETTE_ACTION_EVENT, {
					detail,
				}),
			);
		})
			.then((fn) => {
				if (cancelled) {
					fn();
					return;
				}
				unlisten = fn;
			})
			.catch((err) => {
				// Outside the Tauri runtime (e.g. plain Vite preview) the
				// IPC bridge is missing — log once and carry on. The
				// palette still works via cmd+K.
				console.warn("[command-palette] failed to subscribe to app:menu-action", err);
			});

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, []);

	const value = useMemo<CommandPaletteContextValue>(() => ({ open, setOpen, toggle }), [open, toggle]);

	return createElement(CommandPaletteContext.Provider, { value }, children);
}

export function useCommandPalette(): CommandPaletteContextValue {
	const ctx = useContext(CommandPaletteContext);
	if (!ctx) {
		throw new Error("useCommandPalette must be used inside a <CommandPaletteProvider>");
	}
	return ctx;
}
