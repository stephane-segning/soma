import { getTauriStore } from "@soma/ui/hooks/use-tauri-store";
import type { LazyStore } from "@tauri-apps/plugin-store";

export const SETTINGS_STORE_NAME = "settings.json";

const settingsStore: LazyStore = getTauriStore(SETTINGS_STORE_NAME);

async function ensureSettingsStore(): Promise<LazyStore> {
	await settingsStore.init();
	return settingsStore;
}

export async function getSetting<T>(key: string): Promise<T | null> {
	try {
		const store = await ensureSettingsStore();
		const value = await store.get<T>(key);
		return (value ?? null) as T | null;
	} catch (error) {
		console.warn("Failed to read setting from store", error);
		return null;
	}
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	try {
		const store = await ensureSettingsStore();
		await store.set(key, value);
		await store.save();
	} catch (error) {
		console.warn("Failed to persist setting via store", error);
	}
}
