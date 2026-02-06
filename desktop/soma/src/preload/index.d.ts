import { ElectronAPI } from "@electron-toolkit/preload";
import type { AgentRuntimeEventPayload, DomainEventPayload } from "@soma/desktop-db";

type WindowControlsApi = {
	minimize: () => Promise<void>;
	toggleMaximize: () => Promise<void>;
	close: () => Promise<void>;
};

type RendererApi = {
	invoke: <T = unknown>(channel: string, args?: unknown) => Promise<T>;
	onDomainEvent: (handler: (event: DomainEventPayload) => void) => () => void;
	onAgentEvent: (handler: (event: AgentRuntimeEventPayload) => void) => () => void;
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
