import { is } from "@electron-toolkit/utils";
import { BrowserWindow, shell } from "electron";
import { join } from "path";
import icon from "../../resources/icon.png?asset";
import { splashHtml } from "./windows/splash-html";

export function createWindow(): void {
	const mainWindow = new BrowserWindow({
		width: 900,
		height: 670,
		show: false,
		titleBarStyle: "hidden",
		autoHideMenuBar: true,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
		},
	});
	mainWindow.on("ready-to-show", () => mainWindow.show());
	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url);
		return { action: "deny" };
	});
	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	} else {
		mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

export function createSplashWindow(): BrowserWindow {
	const splash = new BrowserWindow({
		width: 460,
		height: 320,
		resizable: false,
		frame: false,
		transparent: true,
		show: false,
		alwaysOnTop: true,
		center: true,
		webPreferences: { sandbox: true },
	});
	void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
	splash.once("ready-to-show", () => splash.show());
	return splash;
}
