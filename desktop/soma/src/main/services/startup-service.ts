import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
import { join, resolve } from "path";
import icon from "../../../resources/icon.png?asset";
import type { CommandRegistry } from "../command-registry";
import type { AgentClient } from "./agent-client";
import type { AgentEventsService } from "./agent-events";
import type { AppDataStore, WindowState } from "./app-data-store";
import type { BlobProtocolRegistrar } from "./blob-protocol";
import type { DaemonClient, DaemonStreamEvent } from "./daemon-client";
import type { DomainEventsService } from "./domain-events";
import type { AppLogger } from "./logger";

export class StartupService {
	private readonly deepLinkScheme = "soma";
	private mainWindow: BrowserWindow | null = null;
	private splashWindow: BrowserWindow | null = null;
	private pendingDeepLink: string | null = this.extractDeepLink(process.argv);
	private daemonStreamUnsubscribe: (() => void) | null = null;
	private daemonStreamReconnectTimer: NodeJS.Timeout | null = null;
	private daemonStreamStopped = false;
	private agentEventStreamUnsubscribe: (() => void) | null = null;

	constructor(
		private readonly appDataStore: AppDataStore,
		private readonly logger: AppLogger,
		private readonly blobProtocol: BlobProtocolRegistrar,
		private readonly commands: CommandRegistry,
		private readonly daemon: DaemonClient,
		private readonly agent: AgentClient,
		private readonly agentEvents: AgentEventsService,
		private readonly domainEvents: DomainEventsService,
	) {}

	run(): void {
		protocol.registerSchemesAsPrivileged([
			{
				scheme: `${this.deepLinkScheme}-blob`,
				privileges: {
					secure: true,
					standard: true,
				},
			},
		]);

		this.registerEarlyHandlers();

		app.whenReady().then(() => {
			void this.onReady();
		});

		app.on("window-all-closed", () => {
			if (process.platform !== "darwin") {
				app.quit();
			}
		});

		app.on("before-quit", () => {
			this.stopDaemonEventStream();
			this.stopAgentEventStream();
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

	private async onReady(): Promise<void> {
		// Set app user model id for windows
		electronApp.setAppUserModelId("digital.camer.sschool.tapia");

		// Dock icon on macOS comes from the app bundle; Electron can't load .icns
		// at runtime for app.dock.setIcon(), so skip overriding it here.

		this.registerDeepLinkProtocol();

		this.blobProtocol.register();
		this.commands.register(ipcMain);

		// Default open or close DevTools by F12 in development
		// and ignore CommandOrControl + R in production.
		// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
		app.on("browser-window-created", (_, window) => {
			optimizer.watchWindowShortcuts(window);
		});

		this.openSplashWindow();
		await this.waitForDaemonReady();
		this.startDaemonEventStream();
		this.startAgentEventStream();

		this.openMainWindow(this.appDataStore.windowState);
		this.closeSplashWindow();

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
			icon,
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
			return {
				action: "deny",
			};
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

	private openSplashWindow(): void {
		if (this.splashWindow && !this.splashWindow.isDestroyed()) return;

		const splash = new BrowserWindow({
			width: 460,
			height: 320,
			resizable: false,
			frame: false,
			transparent: true,
			show: false,
			alwaysOnTop: true,
			center: true,
			webPreferences: {
				sandbox: true,
			},
		});

		const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { display: grid; place-items: center; background: transparent; }
    .card {
      width: 360px;
      border-radius: 20px;
      padding: 28px 24px;
      color: #f9fafb;
      background: linear-gradient(155deg, #111827 0%, #0f172a 100%);
      box-shadow: 0 20px 60px rgba(2, 6, 23, 0.55);
      text-align: center;
    }
    .title { font-size: 18px; font-weight: 600; margin: 0 0 8px 0; }
    .subtitle { font-size: 13px; opacity: 0.85; margin: 0 0 18px 0; }
    .bar {
      height: 5px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(148, 163, 184, 0.22);
    }
    .bar::after {
      content: "";
      display: block;
      height: 100%;
      width: 42%;
      border-radius: 999px;
      background: linear-gradient(90deg, #22c55e, #38bdf8);
      animation: loading 1.2s ease-in-out infinite;
      transform-origin: left center;
    }
    @keyframes loading {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(340%); }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1 class="title">Starting Soma</h1>
    <p class="subtitle">Waiting for daemon readiness...</p>
    <div class="bar"></div>
  </div>
</body>
</html>`;

		void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
		splash.once("ready-to-show", () => {
			splash.show();
		});
		splash.on("closed", () => {
			if (this.splashWindow === splash) {
				this.splashWindow = null;
			}
		});

		this.splashWindow = splash;
	}

	private closeSplashWindow(): void {
		if (!this.splashWindow || this.splashWindow.isDestroyed()) return;
		this.splashWindow.close();
		this.splashWindow = null;
	}

	private openMainWindow(windowState: WindowState | null): void {
		this.mainWindow = this.createWindow(windowState);
		this.attachWindowStateTracking(this.mainWindow);
	}

	private async waitForDaemonReady(): Promise<void> {
		let attempts = 0;
		this.logger.log("info", "waiting for daemon readiness");
		while (true) {
			attempts += 1;
			try {
				const status = await this.daemon.status();
				if (status.peerId) {
					this.logger.log("info", "daemon ready", {
						peerId: status.peerId,
						listenAddrs: status.listenAddrs,
					});
					return;
				}
				if (attempts % 20 === 0) {
					this.logger.log("warn", "daemon status reported without peer id yet", {
						attempt: attempts,
					});
				}
			} catch (error) {
				if (attempts === 1 || attempts % 20 === 0) {
					this.logger.log("warn", "daemon not ready yet", {
						attempt: attempts,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
			await sleep(500);
		}
	}

	private startDaemonEventStream(): void {
		this.daemonStreamStopped = false;
		this.connectDaemonEventStream();
	}

	private startAgentEventStream(): void {
		if (this.agentEventStreamUnsubscribe) {
			this.agentEventStreamUnsubscribe();
			this.agentEventStreamUnsubscribe = null;
		}
		this.agentEventStreamUnsubscribe = this.agent.startEventStream({
			onEvent: (event) => {
				this.agentEvents.broadcast(event);
			},
		});
	}

	private stopDaemonEventStream(): void {
		this.daemonStreamStopped = true;
		if (this.daemonStreamReconnectTimer) {
			clearTimeout(this.daemonStreamReconnectTimer);
			this.daemonStreamReconnectTimer = null;
		}
		if (this.daemonStreamUnsubscribe) {
			this.daemonStreamUnsubscribe();
			this.daemonStreamUnsubscribe = null;
		}
	}

	private stopAgentEventStream(): void {
		if (!this.agentEventStreamUnsubscribe) return;
		this.agentEventStreamUnsubscribe();
		this.agentEventStreamUnsubscribe = null;
	}

	private connectDaemonEventStream(): void {
		if (this.daemonStreamStopped) return;
		if (this.daemonStreamReconnectTimer) {
			clearTimeout(this.daemonStreamReconnectTimer);
			this.daemonStreamReconnectTimer = null;
		}
		if (this.daemonStreamUnsubscribe) {
			this.daemonStreamUnsubscribe();
			this.daemonStreamUnsubscribe = null;
		}

		this.daemonStreamUnsubscribe = this.daemon.streamEvents({
			onEvent: (event) => this.handleDaemonEvent(event),
			onError: (error) => {
				if (this.daemonStreamStopped) return;
				this.logger.log("warn", "daemon event stream error", {
					error: error.message,
				});
				this.scheduleDaemonStreamReconnect();
			},
			onEnd: () => {
				if (this.daemonStreamStopped) return;
				this.logger.log("warn", "daemon event stream ended; reconnecting");
				this.scheduleDaemonStreamReconnect();
			},
		});
	}

	private scheduleDaemonStreamReconnect(): void {
		if (this.daemonStreamStopped) return;
		if (this.daemonStreamReconnectTimer) return;
		this.daemonStreamReconnectTimer = setTimeout(() => {
			this.daemonStreamReconnectTimer = null;
			this.connectDaemonEventStream();
		}, 1_000);
	}

	private handleDaemonEvent(event: DaemonStreamEvent): void {
		switch (event.kind) {
			case "yoopta-blob-added":
				this.domainEvents.broadcast({
					kind: "document-changed",
					source: "daemon",
					atMs: Date.now(),
					spaceId: event.spaceId,
					documentId: event.docId,
					reason: "daemon_yoopta_blob_added",
				});
				return;
			case "join-decision":
				if (event.spaceId) {
					this.domainEvents.broadcast({
						kind: "space-changed",
						source: "daemon",
						atMs: Date.now(),
						spaceId: event.spaceId,
						reason: "daemon_join_decision",
					});
				} else {
					this.domainEvents.broadcast({
						kind: "spaces-changed",
						source: "daemon",
						atMs: Date.now(),
						reason: "daemon_join_decision",
					});
				}
				return;
			case "join-submitted":
			case "join-failed":
				return;
		}
	}

	private attachWindowStateTracking(window: BrowserWindow): void {
		let saveTimer: NodeJS.Timeout | null = null;

		const save = () => {
			if (window.isDestroyed()) return;
			const isMaximized = window.isMaximized();
			const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
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

		window.on("resize", scheduleSave);
		window.on("move", scheduleSave);
		window.on("maximize", scheduleSave);
		window.on("unmaximize", scheduleSave);
		window.on("enter-full-screen", scheduleSave);
		window.on("leave-full-screen", scheduleSave);
		window.on("close", save);
	}

	private extractDeepLink(argv: string[]): string | null {
		return argv.find((arg) => arg.startsWith(`${this.deepLinkScheme}://`)) ?? null;
	}

	private registerDeepLinkProtocol(): void {
		if (process.defaultApp && process.argv.length >= 2) {
			app.setAsDefaultProtocolClient(this.deepLinkScheme, process.execPath, [resolve(process.argv[1])]);
			return;
		}
		app.setAsDefaultProtocolClient(this.deepLinkScheme);
	}

	private handleDeepLink(url: string): void {
		this.pendingDeepLink = url;
		this.logger.log("info", "received deep link", {
			url,
		});
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

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
