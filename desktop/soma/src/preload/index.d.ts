import { ElectronAPI } from "@electron-toolkit/preload";

type WindowControlsApi =
	{
		minimize: () => Promise<void>;
		toggleMaximize: () => Promise<void>;
		close: () => Promise<void>;
	};

type RendererApi =
	{
		invoke: <
			T = unknown,
		>(
			channel: string,
			args?: unknown,
		) => Promise<T>;
		windowControls: WindowControlsApi;
	};

declare global {
	interface Window {
		electron: ElectronAPI;
		api: RendererApi;
	}
}
