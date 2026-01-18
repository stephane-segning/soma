import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
import { join, resolve } from "path";
import icon from "../../../resources/icon.png?asset";
import type { CommandRegistry } from "../command-registry";
import type { AppDataStore, WindowState } from "./app-data-store";
import type { BlobProtocolRegistrar } from "./blob-protocol";
import type { AppLogger } from "./logger";

export class StartupService {
	private readonly deepLinkScheme = "soma";
	private mainWindow: BrowserWindow | null = null;
	private pendingDeepLink: string | null = this.extractDeepLink(process.argv);

	constructor(
		private readonly appDataStore: AppDataStore,
		private readonly logger: AppLogger,
		private readonly blobProtocol: BlobProtocolRegistrar,
		private readonly commands: CommandRegistry,
	) {}

	run(): void {
		protocol.registerSchemesAsPrivileged([
			{
				scheme: `${this.deepLinkScheme}-blob`,
				privileges: { secure: true, standard: true },
			},
		]);

		this.registerEarlyHandlers();

		app.whenReady().then(() => {
			this.onReady();
		});

		app.on("window-all-closed", () => {
			if (process.platform !== "darwin") {
				app.quit();
			}
		});
	}

	private registerEarlyHandlers(): void {
		const hasSingleInstanceLock = app.requestSingleInstanceLock();
		if (!hasSingleInstanceLock) {
			app.quit();
			return;
		}

		app.on("second-instance", (_event, argv) => {
			const url = this.extractDeepLink(argv);
			if (url) {
				this.handleDeepLink(url);
			}
			this.focusMainWindow();
		});

		app.on("open-url", (event, url) => {
			event.preventDefault();
			this.handleDeepLink(url);
		});
	}

	private onReady(): void {
		// Set app user model id for windows
		electronApp.setAppUserModelId("com.electron");

		this.registerDeepLinkProtocol();

		this.blobProtocol.register();
		this.commands.register(ipcMain);

		// Default open or close DevTools by F12 in development
		// and ignore CommandOrControl + R in production.
		// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
		app.on("browser-window-created", (_, window) => {
			optimizer.watchWindowShortcuts(window);
		});

		this.openMainWindow(this.appDataStore.windowState);

		if (this.pendingDeepLink) {
			this.logger.log("info", "received deep link", {
				url: this.pendingDeepLink,
			});
		}

		app.on("activate", () => {
			// On macOS it's common to re-create a window in the app when the
			// dock icon is clicked and there are no other windows open.
			if (BrowserWindow.getAllWindows().length === 0) {
				this.openMainWindow(this.appDataStore.windowState);
			}
		});
	}

	private createWindow(windowState: WindowState | null): BrowserWindow {
		// Create the browser window.
		const bounds = windowState?.bounds ?? ({} as WindowState["bounds"]);
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
			...(process.platform === "linux" ? { icon } : {}),
			webPreferences: {
				preload: join(__dirname, "../preload/index.js"),
				sandbox: false,
				contextIsolation: true,
			},
		});

		if (process.platform === "darwin") {
			mainWindow.setWindowButtonVisibility(false);
		}

		mainWindow.on("ready-to-show", () => {
			mainWindow.show();
		});

		mainWindow.webContents.on("did-finish-load", () => {
			this.dispatchPendingDeepLink();
		});

		mainWindow.webContents.setWindowOpenHandler((details) => {
			shell.openExternal(details.url);
			return { action: "deny" };
		});

		// HMR for renderer base on electron-vite cli.
		// Load the remote URL for development or the local html file for production.
		if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
			mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
		} else {
			mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
		}

		if (windowState?.isMaximized) {
			mainWindow.maximize();
		}
		if (windowState?.isFullScreen) {
			mainWindow.setFullScreen(true);
		}

		return mainWindow;
	}

	private openMainWindow(windowState: WindowState | null): void {
		this.mainWindow = this.createWindow(windowState);
		this.attachWindowStateTracking(this.mainWindow);
	}

	private attachWindowStateTracking(window: BrowserWindow): void {
		let saveTimer: NodeJS.Timeout | null = null;

		const save = () => {
			if (window.isDestroyed()) return;
			const isMaximized = window.isMaximized();
			const bounds = isMaximized
				? window.getNormalBounds()
				: window.getBounds();
			this.appDataStore.windowState = {
				bounds: {
					x: bounds.x,
					y: bounds.y,
					width: bounds.width,
					height: bounds.height,
				},
				isMaximized,
				isFullScreen: window.isFullScreen(),
			};
		};

		const scheduleSave = () => {
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(save, 250);
		};

		for (const event of [
			"resize",
			"move",
			"maximize",
			"unmaximize",
			"enter-full-screen",
			"leave-full-screen",
		] as const) {
			window.on(event, scheduleSave);
		}
		window.on("close", save);
	}

	private extractDeepLink(argv: string[]): string | null {
		return (
			argv.find((arg) => arg.startsWith(`${this.deepLinkScheme}://`)) ?? null
		);
	}

	private registerDeepLinkProtocol(): void {
		if (process.defaultApp && process.argv.length >= 2) {
			app.setAsDefaultProtocolClient(this.deepLinkScheme, process.execPath, [
				resolve(process.argv[1]),
			]);
			return;
		}
		app.setAsDefaultProtocolClient(this.deepLinkScheme);
	}

	private handleDeepLink(url: string): void {
		this.pendingDeepLink = url;
		this.logger.log("info", "received deep link", { url });
		this.focusMainWindow();
		this.dispatchPendingDeepLink();
	}

	private dispatchDeepLink(url: string): void {
		if (!this.mainWindow) return;
		this.mainWindow.webContents.send("app:deep-link", url);
	}

	private dispatchPendingDeepLink(): void {
		if (!this.pendingDeepLink) return;
		if (!this.mainWindow) return;
		if (this.mainWindow.webContents.isLoading()) return;
		this.dispatchDeepLink(this.pendingDeepLink);
		this.pendingDeepLink = null;
	}

	private focusMainWindow(): void {
		if (!this.mainWindow) return;
		if (this.mainWindow.isMinimized()) this.mainWindow.restore();
		this.mainWindow.show();
		this.mainWindow.focus();
	}
}
