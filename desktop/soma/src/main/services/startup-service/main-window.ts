import { is } from "@electron-toolkit/utils";
import { BrowserWindow, shell } from "electron";
import { join } from "path";
import type { WindowState } from "../app-data-store";

type CreateMainWindowOptions = {
	windowState: WindowState | null;
	icon: string;
	onFinishLoad: () => void;
};

export function createMainWindow(options: CreateMainWindowOptions): BrowserWindow {
	const bounds = options.windowState?.bounds ?? ({} as WindowState["bounds"]);
	const mainWindow = new BrowserWindow({
		width: bounds?.width ?? 900,
		height: bounds?.height ?? 670,
		x: bounds?.x,
		y: bounds?.y,
		show: false,
		frame: false,
		titleBarStyle: "hidden",
		autoHideMenuBar: true,
		titleBarOverlay: false,
		icon: options.icon,
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			contextIsolation: true,
		},
	});

	if (process.platform === "darwin") mainWindow.setWindowButtonVisibility(false);
	mainWindow.on("ready-to-show", () => {
		mainWindow.show();
	});
	mainWindow.webContents.on("did-finish-load", options.onFinishLoad);
	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url);
		return { action: "deny" };
	});
	loadRenderer(mainWindow);
	restoreWindowState(mainWindow, options.windowState);
	return mainWindow;
}

export function saveWindowStateOnChanges(window: BrowserWindow, saveWindowState: (state: WindowState) => void): void {
	let saveTimer: NodeJS.Timeout | null = null;
	const save = () => {
		if (window.isDestroyed()) return;
		const isMaximized = window.isMaximized();
		const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
		saveWindowState({
			bounds: {
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
			},
			isMaximized,
			isFullScreen: window.isFullScreen(),
		});
	};
	const scheduleSave = () => {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 250);
	};

	window.on("resize", scheduleSave);
	window.on("move", scheduleSave);
	window.on("maximize", scheduleSave);
	window.on("unmaximize", scheduleSave);
	window.on("enter-full-screen", scheduleSave);
	window.on("leave-full-screen", scheduleSave);
	window.on("close", save);
}

function loadRenderer(window: BrowserWindow): void {
	const onLoadError = (error: unknown) => {
		console.error("Failed to load renderer:", error);
	};
	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		window.loadURL(process.env["ELECTRON_RENDERER_URL"]).catch(onLoadError);
		return;
	}
	window.loadFile(join(__dirname, "../renderer/index.html")).catch(onLoadError);
}

function restoreWindowState(window: BrowserWindow, windowState: WindowState | null): void {
	if (windowState?.isMaximized) window.maximize();
	if (windowState?.isFullScreen) window.setFullScreen(true);
}
