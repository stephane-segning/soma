import { ElectronAPI } from "@electron-toolkit/preload";
import { Observable } from "rxjs";

	type RendererApi = {
		getLastRoute: () => Promise<string>;
		getSetting: <T = unknown>(key: string) => Promise<T | null>;
		search: (
			query: string,
		) => Promise<Array<{ id: string; title: string; subtitle?: string }>>;
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
