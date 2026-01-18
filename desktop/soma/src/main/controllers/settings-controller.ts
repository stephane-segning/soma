import type { AppDataStore } from "../services/app-data-store";

export class SettingsController {
	constructor(private readonly store: AppDataStore) {}

	get<T>(key: string): T | null {
		const value = this.store.settings[key];
		return (value ?? null) as T | null;
	}

	set(key: string, value: unknown): void {
		const next = { ...this.store.settings, [key]: value };
		this.store.settings = next;
	}
}
