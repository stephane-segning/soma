import { BrowserWindow, type IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerWindowLogHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	// `window_control` matches the Tauri-side command name from `@soma/sdk`
	// so the same renderer call (`backend.windowControls.dispatch(...)`)
	// works under either shell. Payload is `{ args: { action } }` — the
	// shape `tauri::command` collects when the Rust signature is
	// `pub async fn window_control(args: WindowControlArgs)`.
	ipc.handle("window_control", (event, params) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (!window) return;
		const action = params?.args?.action ?? params?.action;
		switch (action) {
			case "minimize":
				return context.windows.minimize(window);
			case "toggleMaximize":
				return context.windows.toggleMaximize(window);
			case "close":
				return context.windows.close(window);
			default:
				return;
		}
	});

	ipc.handle("log:message", (_event, params) => {
		const level = normalizeLogLevel(params?.level ?? "info");
		const message = params?.message ?? "";
		context.logger.log(level, message);
	});
}

function normalizeLogLevel(level: string): "error" | "warn" | "info" | "debug" {
	switch (level) {
		case "error":
			return "error";
		case "warn":
			return "warn";
		case "debug":
			return "debug";
		case "info":
		case "log":
		default:
			return "info";
	}
}
