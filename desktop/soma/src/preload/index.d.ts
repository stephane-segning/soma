import { ElectronAPI } from "@electron-toolkit/preload";

type WindowControlsApi = {
	minimize: () => Promise<void>;
	toggleMaximize: () => Promise<void>;
	close: () => Promise<void>;
};

type RendererApi = {
	invoke: <T = unknown>(channel: string, args?: unknown) => Promise<T>;
	dbStorage: {
		getItem: (key: string) => string | null;
		setItem: (key: string, value: string) => void;
		removeItem: (key: string) => void;
		clear: () => void;
		keys: () => string[];
	};
	windowControls: WindowControlsApi;
};

declare global {
	interface Window {
		electron: ElectronAPI;
		api: RendererApi;
	}
}
