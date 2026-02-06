import { createIpcStorage, createRoutingCollection, createUiPreferencesCollection } from "@soma/desktop-db";

const api = typeof window !== "undefined" ? (window as any).api : undefined;
if (!api?.dbStorage) {
	throw new Error("DB storage bridge unavailable");
}

const storage = createIpcStorage(api.dbStorage);
const uiPreferencesCollection = createUiPreferencesCollection(storage);
const routingCollection = createRoutingCollection(storage);

export { routingCollection, uiPreferencesCollection };
