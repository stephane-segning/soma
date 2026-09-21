/**
 * Pure window-title formatter, split out of `use-window-title.ts` into
 * its own zero-dependency module on purpose: `use-window-title.ts`
 * imports `./backend`, whose non-Tauri (`httpTransport`) branch touches
 * `window.location` at module-evaluation time — fine in a browser/Tauri
 * webview, but it throws under `desktop-app`'s vitest config
 * (`environment: "node"`, no DOM). Keeping this formatter import-free
 * lets `window-title-format.test.ts` exercise it directly without
 * dragging in `@tauri-apps/api` / `@soma/sdk` / `window`.
 */
export function formatWindowTitle(parts: {
	appTitle: string;
	spaceName?: string | null;
	pageTitle?: string | null;
}): string {
	const { appTitle, spaceName, pageTitle } = parts;
	if (spaceName && pageTitle) return `${pageTitle} — ${spaceName}`;
	if (spaceName) return spaceName;
	return appTitle;
}
