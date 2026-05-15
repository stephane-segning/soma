import { ipcMain } from "electron";
import { AppDataStore } from "../services/app-data-store";

const appDataStore = new AppDataStore();

export function registerDbStorageIpc(): void {
	ipcMain.on("db_storage_get", (event, key) => {
		const targetKey = typeof key === "string" ? key : key?.key;
		event.returnValue = targetKey ? appDataStore.getReactDbItem(targetKey) : null;
	});
	ipcMain.on("db_storage_set", (event, payload) => {
		const key = typeof payload?.key === "string" ? payload.key : "";
		const value = typeof payload?.value === "string" ? payload.value : "";
		if (key) appDataStore.setReactDbItem(key, value);
		event.returnValue = true;
	});
	ipcMain.on("db_storage_remove", (event, key) => {
		const targetKey = typeof key === "string" ? key : key?.key;
		if (targetKey) appDataStore.removeReactDbItem(targetKey);
		event.returnValue = true;
	});
	ipcMain.on("db_storage_clear", (event) => {
		appDataStore.clearReactDb();
		event.returnValue = true;
	});
	ipcMain.on("db_storage_keys", (event) => {
		event.returnValue = appDataStore.listReactDbKeys();
	});
}
