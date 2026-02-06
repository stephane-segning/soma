import ElectronStore from "electron-store";
import {
	AGENT_CONFIG_SETTINGS_KEY,
	DEFAULT_AGENT_RUNTIME_CONFIG,
} from "./agent-config";

export type WindowState = {
	bounds?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	isMaximized?: boolean;
	isFullScreen?: boolean;
};

type StoreSchema = {
	settings: Record<string, unknown>;
	windowState?: WindowState | null;
	reactDb?: Record<string, string>;
};

export class AppDataStore {
	private store: ElectronStore<StoreSchema>;

	constructor() {
		// electron-store v10+ may be exported under `.default` when required from CJS;
		// resolve to the constructor explicitly to avoid "not a constructor".
		const StoreCtor: any = (ElectronStore as any).default ?? ElectronStore;

		this.store = new StoreCtor({
			name: "soma-data",
			defaults: {
				settings: {
					[AGENT_CONFIG_SETTINGS_KEY]: DEFAULT_AGENT_RUNTIME_CONFIG,
				},
			},
		}) as ElectronStore<StoreSchema>;
	}

	get settings(): Record<string, unknown> {
		return this.store.get("settings", {});
	}

	set settings(value: Record<string, unknown>) {
		this.store.set("settings", value);
	}

	get windowState(): WindowState | null {
		return this.store.get("windowState", null);
	}

	set windowState(value: WindowState | null) {
		this.store.set("windowState", value);
	}

	private get reactDbStore(): Record<string, string> {
		return this.store.get("reactDb", {});
	}

	private set reactDbStore(value: Record<string, string>) {
		this.store.set("reactDb", value);
	}

	getReactDbItem(key: string): string | null {
		const value = this.reactDbStore[key];
		return typeof value === "string" ? value : null;
	}

	setReactDbItem(key: string, value: string): void {
		this.reactDbStore = {
			...this.reactDbStore,
			[key]: value,
		};
	}

	removeReactDbItem(key: string): void {
		const next = {
			...this.reactDbStore,
		};
		delete next[key];
		this.reactDbStore = next;
	}

	clearReactDb(): void {
		this.reactDbStore = {};
	}

	listReactDbKeys(): string[] {
		return Object.keys(this.reactDbStore);
	}
}
