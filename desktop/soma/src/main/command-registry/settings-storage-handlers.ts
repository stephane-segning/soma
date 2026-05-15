import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerSettingsStorageHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("settings_get", (_event, params) => context.settings.get(params?.key));
	ipc.handle("settings_set", (_event, params) => {
		context.settings.set(params?.key, params?.value);
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
