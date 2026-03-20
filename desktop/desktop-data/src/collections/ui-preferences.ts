import { createCollection, localStorageCollectionOptions } from "@tanstack/react-db";

export const UI_PREFERENCES_RECORD_ID = "state" as const;

export type UiPreferencesRecord = {
  id: typeof UI_PREFERENCES_RECORD_ID;
  version: 1;
  updatedAtMs: number;
  language?: string | null;
};

export function createUiPreferencesRecord(
  data: Omit<UiPreferencesRecord, "id" | "version" | "updatedAtMs">,
  updatedAtMs = Date.now()
): UiPreferencesRecord {
  return {
    id: UI_PREFERENCES_RECORD_ID,
    version: 1,
    updatedAtMs,
    language: data.language ?? null
  };
}

export function isUiPreferencesRecord(value: unknown): value is UiPreferencesRecord {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<UiPreferencesRecord>;
  if (maybe.id !== UI_PREFERENCES_RECORD_ID) return false;
  if (maybe.version !== 1) return false;
  if (typeof maybe.updatedAtMs !== "number") return false;
  if (typeof maybe.language !== "string" && maybe.language !== null && typeof maybe.language !== "undefined") {
    return false;
  }
  return true;
}

export function createUiPreferencesCollection(storage: Storage) {
  return createCollection(
    localStorageCollectionOptions<UiPreferencesRecord>({
      storageKey: "reactdb:ui-preferences",
      storage,
      getKey: (item) => item.id
    })
  );
}
