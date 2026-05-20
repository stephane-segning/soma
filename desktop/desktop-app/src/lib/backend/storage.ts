/**
 * Synchronous key/value storage backed by `localStorage` with
 * fire-and-forget persistence to the daemon-owned `app-data-store`.
 *
 * Why: TanStack DB collections expect synchronous reads/writes. The
 * Electron preload bridge satisfied that with `ipcRenderer.sendSync(...)`.
 * Tauri has no sync invoke, so we instead:
 *
 * 1. Hydrate `localStorage` once at boot from the backend (`hydrate()`).
 * 2. Read/write from `localStorage` synchronously thereafter.
 * 3. Persist every write back to the backend on a microtask so a fresh
 *    process starts up with the same state.
 *
 * The companion `settings` namespace exposes async `get`/`set` for
 * app-wide preferences (e.g. `agent.config`); those don't go through the
 * sync-cache because the renderer code already treats them as async.
 */

import { call } from "./client";

const PREFIX = "soma.dbStorage:";

function lsKey(key: string): string {
	return `${PREFIX}${key}`;
}

function warn(action: string, key: string, err: unknown): void {
	console.warn(`[dbStorage] ${action} '${key}' failed:`, err);
}

export const dbStorage = {
	async hydrate(): Promise<void> {
		try {
			const keys = await call<string[]>("db_storage_keys");
			await Promise.all(
				keys.map(async (key) => {
					try {
						const value = await call<string | null>("db_storage_get", { key });
						if (value !== null && value !== undefined) {
							localStorage.setItem(lsKey(key), value);
						}
					} catch (err) {
						warn("hydrate", key, err);
					}
				}),
			);
		} catch (err) {
			warn("hydrate", "<keys>", err);
		}
	},

	getItem(key: string): string | null {
		return localStorage.getItem(lsKey(key));
	},

	setItem(key: string, value: string): void {
		localStorage.setItem(lsKey(key), value);
		void call<void>("db_storage_set", { key, value }).catch((err) => warn("set", key, err));
	},

	removeItem(key: string): void {
		localStorage.removeItem(lsKey(key));
		void call<void>("db_storage_remove", { key }).catch((err) => warn("remove", key, err));
	},

	clear(): void {
		for (const k of dbStorage.keys()) localStorage.removeItem(lsKey(k));
		void call<void>("db_storage_clear").catch((err) => warn("clear", "<all>", err));
	},

	keys(): string[] {
		const out: string[] = [];
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
		}
		return out;
	},
};

export const settings = {
	get: <T = unknown>(key: string) => call<T | null>("settings_get", { args: { key } }),
	set: (key: string, value: unknown) => call<void>("settings_set", { args: { key, value } }),
	all: () => call<Record<string, unknown>>("settings_get_all"),
};
