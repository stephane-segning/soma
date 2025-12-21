import { ElectronAPI } from "@electron-toolkit/preload";
import { Observable } from "rxjs";

type RendererApi = {
	getLastRoute: () => Promise<string>;
	getSetting: <T = unknown>(key: string) => Promise<T | null>;
	search: (
		query: string,
	) => Promise<Array<{ id: string; title: string; subtitle?: string }>>;
	documents: {
		upsertDraft: (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			published: boolean;
		}) => Promise<{ ok: true }>;
		getDraft: (input: { spaceId: string; documentId: string }) => Promise<{
			spaceId: string;
			documentId: string;
			contentJson: string;
			published: 0 | 1;
			updatedAtMs: number;
		} | null>;
		queueDaemonSync: (input: {
			spaceId: string;
			documentId: string;
			contentJson: string;
			updatedAtMs: number;
		}) => Promise<{ ok: true }>;
	};
	blobs: {
		stage: (input: {
			bytes: Uint8Array;
			mime: string;
			fileName?: string;
		}) => Promise<{
			blobId: string;
			mime: string;
			byteLength: number;
			createdAtMs: number;
			url: string;
		}>;
	};
		daemon: {
			upsertDocument: (input: {
				spaceId: string;
				documentId: string;
				contentJson: string;
				published: boolean;
				updatedAtMs: number;
			}) => Promise<{ ok: true }>;
			syncPublishedDocument: (input: {
				spaceId: string;
				documentId: string;
				contentJson: string;
				updatedAtMs: number;
			}) => Promise<{ ok: true; uploaded: number }>;
		};
	setLastRoute: (route: string) => void;
	window: {
		minimize: () => void;
		toggleMaximize: () => void;
		close: () => void;
	};
};

type IpcBridge = {
	sendToMain: (channel: string, payload?: unknown) => void;
	onMainEvent: <T = unknown>(channel: string) => Observable<T>;
};

declare global {
	interface Window {
		electron: ElectronAPI;
		api: RendererApi;
		ipc: IpcBridge;
	}
}
