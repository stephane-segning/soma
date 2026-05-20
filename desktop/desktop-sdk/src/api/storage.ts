/**
 * Renderer-side storage helpers.
 *
 * `dbStorage` keeps a synchronous facade by mirroring the backend store into
 * `localStorage`: a one-time {@link DbStorage.hydrate} call pulls every key
 * over the wire, after which `getItem` / `setItem` are sync (returns from
 * cache) and writes fire-and-forget back to the daemon. This matches the
 * old Electron `ipcRenderer.sendSync(...)` contract that TanStack DB
 * collections depend on.
 *
 * `settings` ships values as JSON-encoded strings on the wire so the SDK
 * surface stays specta-friendly. The encode / decode happens inside this
 * module — callers receive parsed values.
 */

import type { Transport } from "../transport";

const PREFIX = "soma.dbStorage:";

function lsKey(key: string): string {
	return `${PREFIX}${key}`;
}

function warn(action: string, key: string, err: unknown): void {
	console.warn(`[dbStorage] ${action} '${key}' failed:`, err);
}

export interface DbStorage {
	hydrate(): Promise<void>;
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
	clear(): void;
	keys(): string[];
}

export function dbStorage(t: Transport): DbStorage {
	return {
		async hydrate(): Promise<void> {
			try {
				const keys = await t.invoke<string[]>("db_storage_keys");
				await Promise.all(
					keys.map(async (key) => {
						try {
							const value = await t.invoke<string | null>("db_storage_get", { key });
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

		getItem(key) {
			return localStorage.getItem(lsKey(key));
		},

		setItem(key, value) {
			localStorage.setItem(lsKey(key), value);
			void t.invoke<void>("db_storage_set", { key, value }).catch((err) => warn("set", key, err));
		},

		removeItem(key) {
			localStorage.removeItem(lsKey(key));
			void t.invoke<void>("db_storage_remove", { key }).catch((err) => warn("remove", key, err));
		},

		clear() {
			for (const k of this.keys()) localStorage.removeItem(lsKey(k));
			void t.invoke<void>("db_storage_clear").catch((err) => warn("clear", "<all>", err));
		},

		keys() {
			const out: string[] = [];
			for (let i = 0; i < localStorage.length; i += 1) {
				const k = localStorage.key(i);
				if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
			}
			return out;
		},
	};
}

export function settings(t: Transport) {
	return {
		async get<T = unknown>(key: string): Promise<T | null> {
			const raw = await t.invoke<string | null>("settings_get", { args: { key } });
			return raw === null ? null : (JSON.parse(raw) as T);
		},
		set(key: string, value: unknown): Promise<void> {
			return t.invoke<void>("settings_set", { args: { key, valueJson: JSON.stringify(value) } });
		},
		async all<T = Record<string, unknown>>(): Promise<T> {
			const raw = await t.invoke<string>("settings_get_all");
			return JSON.parse(raw) as T;
		},
	};
}
