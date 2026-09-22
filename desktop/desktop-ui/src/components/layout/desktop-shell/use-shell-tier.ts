import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * ADR-0005 §2 width budgets. Do not add a fourth tier or move these
 * numbers without updating the ADR — the shell is implementing a
 * decision that's already been made, not inventing its own breakpoints.
 *
 *  - `"comfortable"` (>= 1280px) — all columns docked, exactly as today.
 *  - `"tight"` (960-1280px) — side rails collapse to the icon gutter;
 *    opening one slides it in as a right/left-edge drawer with a scrim.
 *  - `"verySmall"` (< 960px) — a summoned rail takes over the full
 *    shell body; the editor (`children`) is the priority surface the
 *    rest of the time. Phone widths (~390px) land here.
 */
export type ShellTier = "comfortable" | "tight" | "verySmall";

const TIGHT_MAX = 1280;
const VERY_SMALL_MAX = 960;

function tierForWidth(width: number): ShellTier {
	if (width < VERY_SMALL_MAX) return "verySmall";
	if (width < TIGHT_MAX) return "tight";
	return "comfortable";
}

/**
 * Tracks `ref`'s own rendered width via `ResizeObserver` (not
 * `window.innerWidth` / `matchMedia`) and maps it to an ADR-0005 §2
 * tier. Measuring the shell's own box keeps this correct if
 * `DesktopShell` is ever mounted somewhere narrower than the full
 * viewport, and needs no SSR/hydration ceremony in a Tauri-only
 * renderer.
 *
 * Starts from a synchronous best guess (`window.innerWidth` when
 * available) so the very first paint already reflects the right tier
 * instead of always flashing "comfortable" for one frame.
 */
export function useShellTier(ref: RefObject<HTMLElement | null>): ShellTier {
	const [tier, setTier] = useState<ShellTier>(() =>
		typeof window === "undefined" ? "comfortable" : tierForWidth(window.innerWidth),
	);
	const frame = useRef<number | null>(null);

	useEffect(() => {
		const node = ref.current;
		if (!node || typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const width = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
			// ResizeObserver can fire several times inside one frame during a
			// live window drag; rAF-batch so we only ever commit once per
			// frame instead of thrashing React state mid-drag.
			if (frame.current !== null) cancelAnimationFrame(frame.current);
			frame.current = requestAnimationFrame(() => setTier(tierForWidth(width)));
		});
		observer.observe(node);
		return () => {
			observer.disconnect();
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [ref]);

	return tier;
}
