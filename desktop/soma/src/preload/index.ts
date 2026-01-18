import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {
	invoke: (channel: string, args?: unknown) =>
		ipcRenderer.invoke(channel, args),
	windowControls: {
		minimize: () =>
			ipcRenderer.invoke("window:control", { action: "minimize" }),
		toggleMaximize: () =>
			ipcRenderer.invoke("window:control", { action: "toggleMaximize" }),
		close: () => ipcRenderer.invoke("window:control", { action: "close" }),
	},
};

if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld("electron", electronAPI);
		contextBridge.exposeInMainWorld("api", api);
	} catch (error) {
		console.error(error);
	}
} else {
	// @ts-ignore (define in dts)
	window.electron = electronAPI;
	// @ts-ignore (define in dts)
	window.api = api;
}
