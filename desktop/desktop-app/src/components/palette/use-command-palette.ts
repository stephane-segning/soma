/**
 * useCommandPalette — open/close state for the global ⌘K command
 * palette. Nothing more: it's a plain boolean store (`open` + `setOpen`
 * + `toggle`).
 *
 * The chord that toggles it (⌘K / Ctrl+K), the native-menu bridge, and
 * every other shortcut now live in `../../lib/shortcuts` — see
 * `CommandPaletteRoot`, which wires `useShortcuts({ "open-palette":
 * toggle, ... })`. This file used to own both an ad-hoc `keydown`
 * listener and a direct Tauri `app:menu-action` subscription; both
 * were folded into that shared registry so there's exactly one place
 * that owns chord matching and one place that owns the Tauri bridge.
 */
import { createContext, createElement, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

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
