import type { BrowserWindow } from "electron";
import log from "electron-log";
import { inject, injectable } from "inversify";
import { debounceTime, fromEvent, merge, type Subscription, tap } from "rxjs";
import { TYPES } from "../tokens";
import type { AppSettingsService } from "./app-settings-service";
import type { IpcService } from "./ipc-service";

type SetSettingPayload = { key: string; value: unknown };
type KvSetPayload = { namespace: string; key: string; value: unknown };
type KvDeletePayload = { namespace: string; key: string };

const CHANNELS = {
	setSetting: "settings:set",
	kvSet: "settings:kv:set",
	kvDelete: "settings:kv:delete",
} as const;

@injectable()
export class AppStateSyncService {
	private readonly logger = log.scope("app-state-sync-service");
	private subscriptions: Subscription[] = [];

	constructor(
		@inject(TYPES.appSettingsService)
		private readonly settings: AppSettingsService,
		@inject(TYPES.ipcService) private readonly ipc: IpcService,
	) {}

	start(mainWindow: BrowserWindow): void {
		this.stop();
		this.trackWindow(mainWindow);
		this.trackRendererMessages();
	}

	stop(): void {
		this.subscriptions.forEach((sub) => sub.unsubscribe());
		this.subscriptions = [];
	}

	private trackWindow(mainWindow: BrowserWindow): void {
		const windowEvents$ = merge(
			fromEvent(mainWindow, "move"),
			fromEvent(mainWindow, "resize"),
		).pipe(
			debounceTime(250),
			tap(() => {
				const bounds = mainWindow.getBounds();
				this.settings
					.setWindowBounds(bounds)
					.catch((error) =>
						this.logger.warn("Failed to persist window bounds", error),
					);
			}),
		);

		this.subscriptions.push(windowEvents$.subscribe());
	}

	private trackRendererMessages(): void {
		const setSetting$ = this.ipc
			.onRendererEvent<SetSettingPayload>(CHANNELS.setSetting)
			.pipe(
				tap(async ({ key, value }) => {
					try {
						await this.settings.set(key, value);
					} catch (error) {
						this.logger.warn(`Failed to persist setting ${key}`, error);
					}
				}),
			);

		const kvSet$ = this.ipc.onRendererEvent<KvSetPayload>(CHANNELS.kvSet).pipe(
			tap(async ({ namespace, key, value }) => {
				try {
					await this.settings.kvSet(namespace, key, value);
				} catch (error) {
					this.logger.warn(`Failed to persist kv ${namespace}/${key}`, error);
				}
			}),
		);

		const kvDelete$ = this.ipc
			.onRendererEvent<KvDeletePayload>(CHANNELS.kvDelete)
			.pipe(
				tap(async ({ namespace, key }) => {
					try {
						await this.settings.kvDelete(namespace, key);
					} catch (error) {
						this.logger.warn(`Failed to delete kv ${namespace}/${key}`, error);
					}
				}),
			);

		this.subscriptions.push(setSetting$.subscribe());
		this.subscriptions.push(kvSet$.subscribe());
		this.subscriptions.push(kvDelete$.subscribe());
	}
}
