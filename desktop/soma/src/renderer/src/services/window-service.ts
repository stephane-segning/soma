import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export const windowControls = {
	minimize(): void {
		appWindow?.minimize?.();
	},
	toggleMaximize(): void {
		appWindow?.toggleMaximize?.();
	},
	close(): void {
		appWindow?.close?.();
	},
};
