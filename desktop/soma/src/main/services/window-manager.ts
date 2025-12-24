import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import { BrowserWindow, shell } from "electron";
import { injectable } from "inversify";
import icon from "../../../resources/icon.png?asset";

@injectable()
export class WindowManager {
	createMainWindow(options?: {
		initialRoute?: string;
		bounds?: Electron.Rectangle;
	}): BrowserWindow {
		const mainWindow = new BrowserWindow({
			width: options?.bounds?.width ?? 1280,
			height: options?.bounds?.height ?? 720,
			minWidth: 720,
			minHeight: 480,
			x: options?.bounds?.x,
			y: options?.bounds?.y,
			show: false,
			frame: false,
			autoHideMenuBar: true,
			...(process.platform === "linux" ? { icon } : {}),
			webPreferences: {
				preload: join(__dirname, "../preload/index.js"),
				sandbox: false,
			},
		});

		mainWindow.on("ready-to-show", () => {
			mainWindow.show();
		});

		mainWindow.webContents.setWindowOpenHandler((details) => {
			shell.openExternal(details.url);
			return { action: "deny" };
		});

		if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
			const baseUrl = process.env["ELECTRON_RENDERER_URL"];
			const initialRoute = options?.initialRoute;
			const url = initialRoute ? `${baseUrl}#${initialRoute}` : baseUrl;
			mainWindow.loadURL(url);
		} else {
			const initialRoute = options?.initialRoute;
			mainWindow.loadFile(join(__dirname, "../renderer/index.html"), {
				hash: initialRoute ?? undefined,
			});
		}

		return mainWindow;
	}
}
