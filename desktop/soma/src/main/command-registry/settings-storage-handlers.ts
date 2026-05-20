import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerSettingsStorageHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	// Settings values cross the IPC boundary as JSON-encoded strings so
	// the wire schema stays specta-friendly on the Tauri side. The
	// Electron `SettingsController` stores raw JS values, so this layer
	// does the encode/decode dance. Callers that still send raw values
	// (`{ key, value }`) keep working as a back-compat fallback.
	ipc.handle("settings_get", (_event, params) => {
		const key = typeof params?.key === "string" ? params.key : "";
		if (!key) return null;
		const value = context.settings.get(key);
		if (value === undefined || value === null) return null;
		try {
			return JSON.stringify(value);
		} catch (error) {
			context.logger.log("warn", "settings_get: failed to serialise value", { key, error });
			return null;
		}
	});

	ipc.handle("settings_set", (_event, params) => {
		const key = typeof params?.key === "string" ? params.key : "";
		if (!key) return;
		// Decoding can throw on malformed `valueJson`. Skip the write in
		// that case — better to keep the existing value than to clobber
		// it with `undefined` from a bad payload.
		try {
			const value = decodeSettingValue(params);
			context.settings.set(key, value);
		} catch (error) {
			context.logger.log("warn", "settings_set: failed to decode value", { key, error });
		}
	});

	ipc.on("db_storage_get", (event, key) => {
		const targetKey = typeof key === "string" ? key : key?.key;
		event.returnValue = targetKey ? context.dbStorage.getItem(targetKey) : null;
	});
	ipc.on("db_storage_set", (event, payload) => {
		const key = typeof payload?.key === "string" ? payload.key : "";
		const value = typeof payload?.value === "string" ? payload.value : "";
		if (key) context.dbStorage.setItem(key, value);
		event.returnValue = true;
	});
	ipc.on("db_storage_remove", (event, key) => {
		const targetKey = typeof key === "string" ? key : key?.key;
		if (targetKey) context.dbStorage.removeItem(targetKey);
		event.returnValue = true;
	});
	ipc.on("db_storage_clear", (event) => {
		context.dbStorage.clear();
		event.returnValue = true;
	});
	ipc.on("db_storage_keys", (event) => {
		event.returnValue = context.dbStorage.keys();
	});
}

function decodeSettingValue(params: { value?: unknown; valueJson?: unknown } | undefined): unknown {
	// Lets `JSON.parse` throw on malformed input so the caller can
	// decide what to do (we skip the write rather than store `undefined`).
	if (typeof params?.valueJson === "string") {
		return JSON.parse(params.valueJson);
	}
	return params?.value;
}
