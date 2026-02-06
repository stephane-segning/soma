import {
	createIpcStorage,
	createMailboxCollection,
	createRoutingCollection,
	createTabsCollection,
	createUiPreferencesCollection,
	createUploadJobsCollection,
} from "@soma/desktop-db";

const api = typeof window !== "undefined" ? (window as any).api : undefined;
if (!api?.dbStorage) {
	throw new Error("DB storage bridge unavailable");
}

const storage = createIpcStorage(api.dbStorage);
const tabsCollection = createTabsCollection(storage);
const mailboxCollection = createMailboxCollection(storage);
const uiPreferencesCollection = createUiPreferencesCollection(storage);
const routingCollection = createRoutingCollection(storage);
const uploadJobsCollection = createUploadJobsCollection(storage);

export { mailboxCollection, routingCollection, tabsCollection, uiPreferencesCollection, uploadJobsCollection };
