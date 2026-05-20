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
	onDeepLink: (handler: (url: string) => void) => {
		const listener = (_event: IpcRendererEvent, payload: unknown) => {
			if (typeof payload === "string") handler(payload);
		};
		ipcRenderer.on("app:deep-link", listener);
		return () => {
			ipcRenderer.removeListener("app:deep-link", listener);
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
	// Window controls now go through `bridge.invoke("window_control", …)` via
	// `@soma/sdk`'s `windowControls.dispatch(action)`; the legacy namespace
	// is retained only as a redirect for any caller still importing
	// `bridge.windowControls.*` directly.
	windowControls: {
		minimize: () =>
			ipcRenderer.invoke("window_control", { args: { action: "minimize" } }),
		toggleMaximize: () =>
			ipcRenderer.invoke("window_control", { args: { action: "toggleMaximize" } }),
		close: () =>
			ipcRenderer.invoke("window_control", { args: { action: "close" } }),
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
