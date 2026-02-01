import type { AppDataStore } from "../services/app-data-store";

export class DbStorageController {
	constructor(private readonly store: AppDataStore) {}

	getItem(key: string): string | null {
		return this.store.getReactDbItem(key);
	}

	setItem(key: string, value: string): void {
		this.store.setReactDbItem(key, value);
	}

	removeItem(key: string): void {
		this.store.removeReactDbItem(key);
	}

	clear(): void {
		this.store.clearReactDb();
	}

	keys(): string[] {
		return this.store.listReactDbKeys();
	}
}
