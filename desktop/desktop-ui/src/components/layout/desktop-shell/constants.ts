/**
 * Per-side width bounds are configured on `DesktopShell` (defaults:
 * left 200-320 px, right 280-720 px). This module exposes the helper
 * that clamps a measured width into that range when the user lets go
 * of the resize handle.
 *
 * The two named exports below remain only as **fallback** envelopes
 * for stories or callers that haven't picked side-specific bounds —
 * they're not meant to be read as "the" panel limits anymore.
 */

export const FALLBACK_MIN_PANEL_WIDTH = 80;
export const FALLBACK_MAX_PANEL_WIDTH = 720;

export function normalizePanelWidth(
	value: unknown,
	fallback: number,
	minWidth: number = FALLBACK_MIN_PANEL_WIDTH,
	maxWidth: number = FALLBACK_MAX_PANEL_WIDTH,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(maxWidth, Math.max(minWidth, value));
}

export function normalizePanelOpen(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}
