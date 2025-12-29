import { LazyStore, type StoreOptions } from "@tauri-apps/plugin-store";
import { useMemo } from "react";

const storeCache = new Map<string, LazyStore>();

function optionsKey(options?: StoreOptions): string {
	if (!options) return "";
	const sorted = Object.keys(options).sort();
	return JSON.stringify(options, sorted);
}

function cacheKey(path: string, options?: StoreOptions): string {
	const normalizedPath = path.trim();
	return `${normalizedPath}::${optionsKey(options)}`;
}

/**
 * Returns a stable LazyStore instance for the given path/options.
 */
export function getTauriStore(path: string, options?: StoreOptions): LazyStore {
	const key = cacheKey(path, options);
	const existing = storeCache.get(key);
	if (existing) return existing;

	const store = new LazyStore(path, options);
	storeCache.set(key, store);
	return store;
}

/**
 * React hook to obtain a cached LazyStore instance.
 * Ensures a single instance per store path/options across renders.
 */
export function useTauriStore(path: string, options?: StoreOptions): LazyStore {
	return useMemo(() => getTauriStore(path, options), [path, options]);
}
