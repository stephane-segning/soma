import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge } from "electron";
import { fromEventPattern } from "rxjs";
import { filter, map } from "rxjs/operators";

// Custom APIs for renderer
const api = {
	getLastRoute: (): Promise<string> =>
		electronAPI.ipcRenderer.invoke("router:get-last-route") as Promise<string>,
	getSetting: <T = unknown>(key: string): Promise<T | null> =>
		electronAPI.ipcRenderer.invoke("settings:get", key) as Promise<T | null>,
	search: (
		query: string,
	): Promise<Array<{ id: string; title: string; subtitle?: string }>> =>
		electronAPI.ipcRenderer.invoke("search:query", query) as Promise<
			Array<{ id: string; title: string; subtitle?: string }>
		>,
	documents: {
		upsertDraft: (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			published: boolean;
		}): Promise<{ ok: true }> =>
			electronAPI.ipcRenderer.invoke(
				"documents:upsert-draft",
				input,
			) as Promise<{ ok: true }>,
		getDraft: (input: { spaceId: string; documentId: string }) =>
			electronAPI.ipcRenderer.invoke("documents:get-draft", input) as Promise<{
				spaceId: string;
				documentId: string;
				contentJson: string;
				published: 0 | 1;
				updatedAtMs: number;
			} | null>,
		queueDaemonSync: (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
		}): Promise<{ ok: true }> =>
			electronAPI.ipcRenderer.invoke(
				"documents:queue-daemon-sync",
				input,
			) as Promise<{ ok: true }>,
	},
	blobs: {
		stage: (input: { bytes: Uint8Array; mime: string; fileName?: string }) =>
			electronAPI.ipcRenderer.invoke("blobs:stage", input) as Promise<{
				blobId: string;
				mime: string;
				byteLength: number;
				createdAtMs: number;
				url: string;
			}>,
	},
		daemon: {
			upsertDocument: (input: {
				spaceId: string;
				documentId: string;
				contentJson: string;
				published: boolean;
				updatedAtMs: number;
			}): Promise<{ ok: true }> =>
				electronAPI.ipcRenderer.invoke(
					"daemon:upsert-document",
					input,
				) as Promise<{ ok: true }>,
			syncPublishedDocument: (input: {
				spaceId: string;
				documentId: string;
				contentJson: string;
				updatedAtMs: number;
			}): Promise<{ ok: true; uploaded: number }> =>
				electronAPI.ipcRenderer.invoke(
					"daemon:sync-published-document",
					input,
				) as Promise<{ ok: true; uploaded: number }>,
		},
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
	// @ts-expect-error (define in dts)
	window.electron = electronAPI;
	// @ts-expect-error (define in dts)
	window.api = api;
	// @ts-expect-error (define in dts)
	window.ipc = ipc;
}
