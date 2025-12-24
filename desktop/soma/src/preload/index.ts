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
			published?: boolean;
		}): Promise<{ ok: true }> =>
			electronAPI.ipcRenderer.invoke(
				"documents:queue-daemon-sync",
				input,
			) as Promise<{ ok: true }>,
		ensurePage: (input: {
			spaceId: string;
			pageId?: string;
			title?: string;
			parentPageIds?: string[];
		}) =>
			electronAPI.ipcRenderer.invoke(
				"documents:ensure-page",
				input,
			) as Promise<{
				spaceId: string;
				pageId: string;
				title: string;
				parentPageIds: string[];
				createdAtMs: number;
				updatedAtMs: number;
			}>,
		listPages: (input: { spaceId: string }) =>
			electronAPI.ipcRenderer.invoke("documents:list-pages", input) as Promise<
				Array<{
					spaceId: string;
					pageId: string;
					title: string;
					parentPageIds: string[];
					createdAtMs: number;
					updatedAtMs: number;
				}>
			>,
		updatePageTitle: (input: {
			spaceId: string;
			pageId: string;
			title: string;
		}) =>
			electronAPI.ipcRenderer.invoke(
				"documents:update-page-title",
				input,
			) as Promise<{
				spaceId: string;
				pageId: string;
				title: string;
				parentPageIds: string[];
				createdAtMs: number;
				updatedAtMs: number;
			} | null>,
		setPageParents: (input: {
			spaceId: string;
			pageId: string;
			parentPageIds: string[];
		}) =>
			electronAPI.ipcRenderer.invoke(
				"documents:set-page-parents",
				input,
			) as Promise<{
				spaceId: string;
				pageId: string;
				title: string;
				parentPageIds: string[];
				createdAtMs: number;
				updatedAtMs: number;
			} | null>,
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
	agent: {
		inlineComplete: (input: { prompt: string; context?: string }) =>
			electronAPI.ipcRenderer.invoke(
				"agent:inline-complete",
				input,
			) as Promise<{ completion: string }>,
		chat: (input: {
			messages: Array<{ role: string; content: string }>;
			model?: string;
			temperature?: number;
			maxTokens?: number;
		}) =>
			electronAPI.ipcRenderer.invoke("agent:chat", input) as Promise<{
				content: string;
				model: string;
			}>,
		embed: (input: { input: string[]; model?: string }) =>
			electronAPI.ipcRenderer.invoke("agent:embed", input) as Promise<{
				embeddings: number[][];
			}>,
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
