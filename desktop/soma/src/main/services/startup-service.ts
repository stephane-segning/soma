import { electronApp, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { resolve } from "path";
import icon from "../../../resources/icon.png?asset";
import type { CommandRegistry } from "../command-registry";
import type { AddonRuntime } from "./addon-runtime";
import type { AgentClient } from "./agent-client";
import type { AgentEventsService } from "./agent-events";
import type { AppDataStore, WindowState } from "./app-data-store";
import type { BlobProtocolRegistrar } from "./blob-protocol";
import type { DaemonClient } from "./daemon-client";
import type { DomainEventsService } from "./domain-events";
import type { AppLogger } from "./logger";
import { DaemonEventStreamBridge } from "./startup-service/daemon-events";
import { createMainWindow, saveWindowStateOnChanges } from "./startup-service/main-window";
import { createSplashWindow } from "./startup-service/splash-window";

export class StartupService {
	private readonly deepLinkScheme = "soma";
	private mainWindow: BrowserWindow | null = null;
	private splashWindow: BrowserWindow | null = null;
	private pendingDeepLink: string | null = this.extractDeepLink(process.argv);
	private agentEventStreamUnsubscribe: (() => void) | null = null;
	private readonly daemonEvents: DaemonEventStreamBridge;

	constructor(
		private readonly appDataStore: AppDataStore,
		private readonly logger: AppLogger,
		private readonly blobProtocol: BlobProtocolRegistrar,
		private readonly commands: CommandRegistry,
		private readonly addonRuntime: AddonRuntime,
		daemon: DaemonClient,
		private readonly agent: AgentClient,
		private readonly agentEvents: AgentEventsService,
		domainEvents: DomainEventsService,
	) {
		this.daemonEvents = new DaemonEventStreamBridge(daemon, domainEvents, logger);
	}

	run(): void {
		protocol.registerSchemesAsPrivileged([
			{
				scheme: `${this.deepLinkScheme}-blob`,
				privileges: { secure: true, standard: true },
			},
		]);

		this.registerEarlyHandlers();
		app.whenReady().then(() => {
			void this.onReady();
		});
		app.on("window-all-closed", () => {
			if (process.platform !== "darwin") app.quit();
		});
		// Intercept the quit so we can await the async addon shutdown. Electron
		// would otherwise tear down the process while shutdown() is still
		// flushing DB state / closing libp2p sockets, risking corruption.
		// `shuttingDown` guards re-entry on the second app.quit() call below.
		let shuttingDown = false;
		app.on("before-quit", (event) => {
			if (shuttingDown) return;
			event.preventDefault();
			shuttingDown = true;
			this.daemonEvents.stop();
			this.stopAgentEventStream();
			this.addonRuntime
				.shutdown()
				.catch((error) => {
					this.logger.log("warn", "addon shutdown raised; quitting anyway", {
						error: error instanceof Error ? error.message : String(error),
					});
				})
				.finally(() => app.quit());
		});
	}

	private registerEarlyHandlers(): void {
		if (!app.requestSingleInstanceLock()) {
			app.quit();
			return;
		}

		app.on("second-instance", (_event, argv) => {
			const url = this.extractDeepLink(argv);
			if (url) this.handleDeepLink(url);
			this.focusMainWindow();
		});
		app.on("open-url", (event, url) => {
			event.preventDefault();
			this.handleDeepLink(url);
		});
	}

	private async onReady(): Promise<void> {
		electronApp.setAppUserModelId("digital.camer.soma");
		this.registerDeepLinkProtocol();
		this.blobProtocol.register();
		this.commands.register(ipcMain);

		app.on("browser-window-created", (_, window) => {
			optimizer.watchWindowShortcuts(window);
		});

		this.openSplashWindow();

		try {
			await this.addonRuntime.start();
		} catch (error) {
			this.logger.log("error", "@soma/node addon runtime failed to start at boot", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		this.daemonEvents.start();
		this.startAgentEventStream();
		this.openMainWindow(this.appDataStore.windowState);
		this.closeSplashWindow();
		this.logPendingDeepLink();

		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				this.openMainWindow(this.appDataStore.windowState);
			}
		});
	}

	private openSplashWindow(): void {
		if (this.splashWindow && !this.splashWindow.isDestroyed()) return;
		this.splashWindow = createSplashWindow(() => {
			this.splashWindow = null;
		});
	}

	private closeSplashWindow(): void {
		if (!this.splashWindow || this.splashWindow.isDestroyed()) return;
		this.splashWindow.close();
		this.splashWindow = null;
	}

	private openMainWindow(windowState: WindowState | null): void {
		this.mainWindow = createMainWindow({
			windowState,
			icon,
			onFinishLoad: () => this.dispatchPendingDeepLink(),
		});
		saveWindowStateOnChanges(this.mainWindow, (state) => {
			this.appDataStore.windowState = state;
		});
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

	private stopAgentEventStream(): void {
		if (!this.agentEventStreamUnsubscribe) return;
		this.agentEventStreamUnsubscribe();
		this.agentEventStreamUnsubscribe = null;
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
		this.logger.log("info", "received deep link", { url });
		this.focusMainWindow();
		this.dispatchPendingDeepLink();
	}

	private dispatchPendingDeepLink(): void {
		if (!this.pendingDeepLink || !this.mainWindow) return;
		if (this.mainWindow.webContents.isLoading()) return;
		this.mainWindow.webContents.send("app:deep-link", this.pendingDeepLink);
		this.pendingDeepLink = null;
	}

	private focusMainWindow(): void {
		if (!this.mainWindow) return;
		if (this.mainWindow.isMinimized()) this.mainWindow.restore();
		this.mainWindow.show();
		this.mainWindow.focus();
	}

	private logPendingDeepLink(): void {
		if (!this.pendingDeepLink) return;
		this.logger.log("info", "received deep link", { url: this.pendingDeepLink });
	}
}
