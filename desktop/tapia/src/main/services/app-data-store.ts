import ElectronStore from "electron-store";

type StoreSchema = {
	reactDb?: Record<string, string>;
};

export class AppDataStore {
	private store: ElectronStore<StoreSchema>;

	constructor() {
		const StoreCtor: any = (ElectronStore as any).default ?? ElectronStore;
		this.store = new StoreCtor({
			name: "tapia-data",
			defaults: {},
		}) as ElectronStore<StoreSchema>;
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
