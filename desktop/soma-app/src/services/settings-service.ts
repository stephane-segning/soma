import type { LazyStore } from "@tauri-apps/plugin-store";
import { getTauriStore } from "soma-ui/hooks/use-tauri-store";

export const SETTINGS_STORE_NAME = "settings.json";
export const LAST_ROUTE_KEY = "lastRoute";

const settingsStore: LazyStore = getTauriStore(SETTINGS_STORE_NAME);

async function ensureSettingsStore(): Promise<LazyStore> {
	await settingsStore.init();
	return settingsStore;
}

export function normalizeRoute(route: string): string {
	const trimmed = route.trim();
	if (!trimmed) return "/spaces/landing";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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

export async function getLastRoute(): Promise<string> {
	try {
		const store = await ensureSettingsStore();
		const route = await store.get<string>(LAST_ROUTE_KEY);
		return route ? normalizeRoute(route) : "/spaces/landing";
	} catch (error) {
		console.warn("Failed to read last route from store", error);
		return "/spaces/landing";
	}
}
