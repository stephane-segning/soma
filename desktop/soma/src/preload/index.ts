import { electronAPI } from "@electron-toolkit/preload";
import {
	type AgentRuntimeEventPayload,
	type DomainEventPayload,
	parseAgentRuntimeEventPayload,
	parseDomainEventPayload,
} from "@soma/desktop-db";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

const api = {
	invoke: (channel: string, args?: unknown) => ipcRenderer.invoke(channel, args),
	onDomainEvent: (handler: (event: DomainEventPayload) => void) => {
		const listener = (_event: IpcRendererEvent, payload: unknown) => {
			const event = parseDomainEventPayload(payload);
			if (!event) return;
			handler(event);
		};
		ipcRenderer.on("domain_event", listener);
		return () => {
			ipcRenderer.removeListener("domain_event", listener);
		};
	},
	onAgentEvent: (handler: (event: AgentRuntimeEventPayload) => void) => {
		const listener = (_event: IpcRendererEvent, payload: unknown) => {
			const event = parseAgentRuntimeEventPayload(payload);
			if (!event) return;
			handler(event);
		};
		ipcRenderer.on("agent_event", listener);
		return () => {
			ipcRenderer.removeListener("agent_event", listener);
		};
	},
	dbStorage: {
		getItem: (key: string) => ipcRenderer.sendSync("db_storage_get", key) as string | null,
		setItem: (key: string, value: string) =>
			ipcRenderer.sendSync("db_storage_set", {
				key,
				value,
			}),
		removeItem: (key: string) => ipcRenderer.sendSync("db_storage_remove", key),
		clear: () => ipcRenderer.sendSync("db_storage_clear"),
		keys: () => ipcRenderer.sendSync("db_storage_keys") as string[],
	},
	windowControls: {
		minimize: () =>
			ipcRenderer.invoke("window:control", {
				action: "minimize",
			}),
		toggleMaximize: () =>
			ipcRenderer.invoke("window:control", {
				action: "toggleMaximize",
			}),
		close: () =>
			ipcRenderer.invoke("window:control", {
				action: "close",
			}),
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
	// @ts-expect-error (define in dts)
	window.electron = electronAPI;
	// @ts-expect-error (define in dts)
	window.api = api;
}
