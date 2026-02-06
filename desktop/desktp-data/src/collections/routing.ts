import { createCollection, localStorageCollectionOptions } from "@tanstack/react-db";

export const ROUTING_RECORD_ID = "state" as const;

export type RoutingRecord = {
  id: typeof ROUTING_RECORD_ID;
  version: 1;
  updatedAtMs: number;
  lastPath?: string;
  lastSpaceId?: string;
  lastTabId?: string;
};

export function createRoutingRecord(input: {
  lastPath?: string;
  lastSpaceId?: string;
  lastTabId?: string;
  updatedAtMs?: number;
}): RoutingRecord {
  return {
    id: ROUTING_RECORD_ID,
    version: 1,
    updatedAtMs: input.updatedAtMs ?? Date.now(),
    lastPath: input.lastPath,
    lastSpaceId: input.lastSpaceId,
    lastTabId: input.lastTabId
  };
}

export function isRoutingRecord(value: unknown): value is RoutingRecord {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<RoutingRecord>;
  if (maybe.id !== ROUTING_RECORD_ID) return false;
  if (maybe.version !== 1) return false;
  if (typeof maybe.updatedAtMs !== "number") return false;
  if (typeof maybe.lastPath !== "string" && typeof maybe.lastPath !== "undefined") return false;
  if (typeof maybe.lastSpaceId !== "string" && typeof maybe.lastSpaceId !== "undefined") return false;
  if (typeof maybe.lastTabId !== "string" && typeof maybe.lastTabId !== "undefined") return false;
  return true;
}

export function createRoutingCollection(storage: Storage) {
  return createCollection(
    localStorageCollectionOptions<RoutingRecord>({
      storageKey: "reactdb:routing",
      storage,
      getKey: (item) => item.id
    })
  );
}
