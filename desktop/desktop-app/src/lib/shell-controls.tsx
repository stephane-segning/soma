/**
 * ShellControls — a small typed context that lets code mounted
 * *outside* the router (the command palette / shortcut registry root)
 * call the rail toggles owned *inside* it (`AppLayout`).
 *
 * `CommandPaletteRoot` is deliberately a sibling of `<RouterProvider>`
 * (see its own docstring), so it has no access to `AppLayout`'s
 * `leftExpanded` / `rightExpanded` state via props or router context.
 * Rather than forking that state into a second store, `AppLayout`
 * *publishes* its own toggle functions into this context on mount via
 * `useRegisterShellControls`; `useShellControls` (read-only) is what
 * `CommandPaletteRoot` calls to reach them. Nothing here owns state —
 * it's a registration slot, not a store.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type ShellControls = {
	/** Collapse the whole left (Pages + Nav) rail if any panel is open; restore the default set otherwise. */
	toggleSpacesRail: () => void;
	/** Same idea for the right (Chat + Bots) rail. */
	toggleChatSidebar: () => void;
};

const NOOP_CONTROLS: ShellControls = {
	toggleSpacesRail: () => {},
	toggleChatSidebar: () => {},
};

type ShellControlsContextValue = {
	controls: ShellControls;
	setControls: (next: ShellControls | null) => void;
};

const ShellControlsContext = createContext<ShellControlsContextValue | null>(null);

export function ShellControlsProvider({ children }: { children: ReactNode }) {
	const [controls, setControlsState] = useState<ShellControls>(NOOP_CONTROLS);
	const value = useMemo<ShellControlsContextValue>(
		() => ({
			controls,
			setControls: (next) => setControlsState(next ?? NOOP_CONTROLS),
		}),
		[controls],
	);
	return <ShellControlsContext.Provider value={value}>{children}</ShellControlsContext.Provider>;
}

function useShellControlsContext(): ShellControlsContextValue {
	const ctx = useContext(ShellControlsContext);
	if (!ctx) throw new Error("Shell controls hooks must be used inside a <ShellControlsProvider>");
	return ctx;
}

/** Called by `AppLayout` to publish its real toggle functions once mounted. Unregisters on unmount. */
export function useRegisterShellControls(controls: ShellControls): void {
	const { setControls } = useShellControlsContext();
	useEffect(() => {
		setControls(controls);
		return () => setControls(null);
		// `controls` should be a referentially-stable object (its functions
		// built with empty-deps `useCallback`s in `AppLayout`) — otherwise
		// this re-registers on every render instead of once.
	}, [setControls, controls]);
}

/** Called by anything outside `AppLayout` (today: `CommandPaletteRoot`) that needs to invoke the active shell's rail toggles. */
export function useShellControls(): ShellControls {
	return useShellControlsContext().controls;
}
