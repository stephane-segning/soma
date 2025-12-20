import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { fromEventPattern } from "rxjs";
import { filter, map } from "rxjs/operators";

// Custom APIs for renderer
const api = {
	getLastRoute: (): Promise<string> =>
		electronAPI.ipcRenderer.invoke("router:get-last-route") as Promise<string>,
	getSetting: <T = unknown>(key: string): Promise<T | null> =>
		electronAPI.ipcRenderer.invoke("settings:get", key) as Promise<T | null>,
	setLastRoute: (route: string): void =>
		electronAPI.ipcRenderer.send("router:set-last-route", route),
	window: {
		minimize: (): void => electronAPI.ipcRenderer.send("window:minimize"),
		toggleMaximize: (): void =>
			electronAPI.ipcRenderer.send("window:toggle-maximize"),
		close: (): void => electronAPI.ipcRenderer.send("window:close"),
	},
};

const ipc = {
	sendToMain: (channel: string, payload?: unknown): void => {
		electronAPI.ipcRenderer.send("ipc:renderer-event", { channel, payload });
	},
	onMainEvent: <T = unknown>(channel: string) =>
		fromEventPattern<
			[Electron.IpcRendererEvent, { channel: string; payload: T }]
		>(
			(handler) => electronAPI.ipcRenderer.on("ipc:main-event", handler),
			(handler) =>
				electronAPI.ipcRenderer.removeListener("ipc:main-event", handler),
		).pipe(
			map(([, message]) => message),
			filter((message) => message.channel === channel),
			map((message) => message.payload),
		),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld("electron", electronAPI);
		contextBridge.exposeInMainWorld("api", api);
		contextBridge.exposeInMainWorld("ipc", ipc);
	} catch (error) {
		console.error(error);
	}
} else {
	// @ts-ignore (define in dts)
	window.electron = electronAPI;
	// @ts-ignore (define in dts)
	window.api = api;
	// @ts-ignore (define in dts)
	window.ipc = ipc;
}
