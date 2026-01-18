import { BrowserWindow } from "electron";

export class WindowController {
	minimize(window?: BrowserWindow | null): void {
		window?.minimize();
	}

	toggleMaximize(window?: BrowserWindow | null): void {
		if (!window) return;
		if (window.isMaximized()) {
			window.unmaximize();
		} else {
			window.maximize();
		}
	}

	close(window?: BrowserWindow | null): void {
		window?.close();
	}
}
