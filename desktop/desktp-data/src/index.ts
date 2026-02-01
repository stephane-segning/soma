export {
  createIpcStorage,
  type DbStorageBridge
} from "./storage/ipc-storage";

export {
  createTabsCollection,
  createTabsRecord,
  isTabsRecord,
  tabsRecordToSnapshot,
  type TabsRecord,
  type TabsSnapshot,
  type TabsTab,
  TABS_RECORD_ID
} from "./collections/tabs";
