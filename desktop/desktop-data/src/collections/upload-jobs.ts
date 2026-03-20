import { createCollection, localStorageCollectionOptions } from "@tanstack/react-db";

export type UploadJobStatus = "queued" | "uploading" | "done" | "failed";

export type UploadJobResult = {
  cid: string;
  url: string;
  size: number;
  mime: string;
  name: string;
  variants?: {
    cid: string;
    size: number;
    mime: string;
    name: string;
    url: string;
    width?: number;
    height?: number;
  }[];
};

export type UploadJobRecord = {
  id: string;
  version: 1;
  createdAtMs: number;
  updatedAtMs: number;
  spaceId: string;
  docId?: string;
  fileName?: string;
  mime: string;
  byteLength: number;
  payloadPath?: string;
  bytesBase64?: string;
  status: UploadJobStatus;
  attempts: number;
  lastError?: string;
  result?: UploadJobResult;
};

export function createUploadJobRecord(input: {
  id: string;
  spaceId: string;
  docId?: string;
  fileName?: string;
  mime: string;
  byteLength: number;
  payloadPath?: string;
  bytesBase64?: string;
  createdAtMs?: number;
}): UploadJobRecord {
  const now = input.createdAtMs ?? Date.now();
  return {
    id: input.id,
    version: 1,
    createdAtMs: now,
    updatedAtMs: now,
    spaceId: input.spaceId,
    docId: input.docId,
    fileName: input.fileName,
    mime: input.mime,
    byteLength: input.byteLength,
    payloadPath: input.payloadPath,
    bytesBase64: input.bytesBase64,
    status: "queued",
    attempts: 0
  };
}

export function isUploadJobRecord(value: unknown): value is UploadJobRecord {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<UploadJobRecord>;
  if (maybe.version !== 1) return false;
  if (typeof maybe.id !== "string") return false;
  if (typeof maybe.spaceId !== "string") return false;
  if (typeof maybe.mime !== "string") return false;
  if (typeof maybe.byteLength !== "number") return false;
  if (typeof maybe.createdAtMs !== "number") return false;
  if (typeof maybe.updatedAtMs !== "number") return false;
  if (maybe.payloadPath && typeof maybe.payloadPath !== "string") return false;
  if (maybe.bytesBase64 && typeof maybe.bytesBase64 !== "string") return false;
  if (maybe.status !== "queued" && maybe.status !== "uploading" && maybe.status !== "done" && maybe.status !== "failed") {
    return false;
  }
  if (typeof maybe.attempts !== "number") return false;
  return true;
}

export function createUploadJobsCollection(storage: Storage) {
  return createCollection(
    localStorageCollectionOptions<UploadJobRecord>({
      storageKey: "reactdb:upload-jobs",
      storage,
      getKey: (item) => item.id
    })
  );
}
