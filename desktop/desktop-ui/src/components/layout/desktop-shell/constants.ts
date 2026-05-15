export const MIN_PANEL_WIDTH = 80;
export const MAX_PANEL_WIDTH = 640;

export function normalizePanelWidth(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, value));
}

export function normalizePanelOpen(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}
