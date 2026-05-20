/**
 * Renderer-side settings service. Delegates to `@soma/sdk`'s
 * `backend.settings.*` — channel names + JSON-encode/decode live in
 * the SDK now.
 *
 * The SDK ships values as JSON-encoded strings on the wire
 * (`valueJson`) so the typed Rust handler stays specta-friendly; the
 * Electron-side handler consumes the same convention and stores raw
 * JS values via `electron-store`.
 */

import { backend } from "../lib/ipc";

export async function getSetting<T>(key: string): Promise<T | null> {
	try {
		return await backend.settings.get<T>(key);
	} catch (error) {
		console.warn("Failed to read setting from store", error);
		return null;
	}
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	try {
		await backend.settings.set(key, value);
	} catch (error) {
		console.warn("Failed to persist setting via store", error);
	}
}
