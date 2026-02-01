import { createCollection, localStorageCollectionOptions } from "@tanstack/react-db";

export type TabsTab = {
  id: string;
  title: string;
  path: string;
};

export type TabsSnapshot = {
  version: 1;
  activeId: string;
  tabs: TabsTab[];
};

export const TABS_RECORD_ID = "state" as const;

export type TabsRecord = TabsSnapshot & {
  id: typeof TABS_RECORD_ID;
  updatedAtMs: number;
};

export function createTabsRecord(snapshot: TabsSnapshot, updatedAtMs = Date.now()): TabsRecord {
  return {
    id: TABS_RECORD_ID,
    updatedAtMs,
    version: snapshot.version,
    activeId: snapshot.activeId,
    tabs: snapshot.tabs
  };
}

export function tabsRecordToSnapshot(record: TabsRecord): TabsSnapshot {
  return {
    version: 1,
    activeId: record.activeId,
    tabs: record.tabs
  };
}

export function isTabsRecord(value: unknown): value is TabsRecord {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<TabsRecord>;
  if (maybe.id !== TABS_RECORD_ID) return false;
  if (maybe.version !== 1) return false;
  if (typeof maybe.updatedAtMs !== "number") return false;
  if (typeof maybe.activeId !== "string") return false;
  if (!Array.isArray(maybe.tabs)) return false;
  for (const tab of maybe.tabs) {
    if (!tab || typeof tab !== "object") return false;
    const t = tab as Partial<TabsTab>;
    if (typeof t.id !== "string") return false;
    if (typeof t.title !== "string") return false;
    if (typeof t.path !== "string") return false;
  }
  return true;
}

export function createTabsCollection(storage: Storage) {
  return createCollection(
    localStorageCollectionOptions<TabsRecord>({
      id: "tabs",
      storageKey: "reactdb:tabs",
      storage,
      getKey: (item) => item.id
    })
  );
}
