import { BrowserWindow, ipcMain } from "electron";
import { injectable } from "inversify";
import { Observable, Subject } from "rxjs";
import { filter, map, share } from "rxjs/operators";
import log from "electron-log";

type IpcEnvelope<T = unknown> = {
	channel: string;
	payload?: T;
};

const RENDERER_EVENT_CHANNEL = "ipc:renderer-event";
const MAIN_EVENT_CHANNEL = "ipc:main-event";

@injectable()
export class IpcService {
	private readonly logger = log.scope("ipc-service");
	private readonly rendererEvents$ = new Subject<IpcEnvelope>();
	private targetWindow?: BrowserWindow;

	constructor() {
		ipcMain.on(RENDERER_EVENT_CHANNEL, (_event, message: IpcEnvelope) => {
			if (!message?.channel) {
				this.logger.warn("Dropped renderer message without channel", message);
				return;
			}
			this.rendererEvents$.next(message);
		});
	}

	attachWindow(window: BrowserWindow): void {
		this.targetWindow = window;
		window.on("closed", () => {
			if (this.targetWindow === window) {
				this.targetWindow = undefined;
			}
		});
	}

	/**
	 * Broadcast a message to the renderer process.
	 */
	send<T = unknown>(channel: string, payload?: T): void {
		if (!this.targetWindow) {
			this.logger.warn(`No target window to send channel "${channel}"`);
			return;
		}
		this.targetWindow.webContents.send(MAIN_EVENT_CHANNEL, {
			channel,
			payload,
		});
	}

	/**
	 * Observe messages sent from the renderer.
	 */
	onRendererEvent<T = unknown>(channel: string): Observable<T> {
		return this.rendererEvents$.pipe(
			filter((message) => message.channel === channel),
			map((message) => message.payload as T),
			share(),
		);
	}

	/**
	 * Access to the raw renderer event stream.
	 */
	get rendererEvents(): Observable<IpcEnvelope> {
		return this.rendererEvents$.asObservable();
	}
}
