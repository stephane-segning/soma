import { createCollection, localStorageCollectionOptions } from "@tanstack/react-db";

export type MailboxEntry = {
  contentJson: string | null;
  title?: string | null;
  updatedAtMs: number;
};

export type MailboxRecord = MailboxEntry & {
  id: string;
  version: 1;
  spaceId: string;
  pageId: string;
};

export function mailboxRecordId(spaceId: string, pageId: string): string {
  return `${spaceId}:${pageId}`;
}

export function createMailboxRecord(spaceId: string, pageId: string, entry: MailboxEntry): MailboxRecord {
  return {
    id: mailboxRecordId(spaceId, pageId),
    version: 1,
    spaceId,
    pageId,
    contentJson: entry.contentJson,
    title: entry.title,
    updatedAtMs: entry.updatedAtMs
  };
}

export function mailboxRecordToEntry(record: MailboxRecord): MailboxEntry {
  return {
    contentJson: record.contentJson,
    title: record.title,
    updatedAtMs: record.updatedAtMs
  };
}

export function isMailboxRecord(value: unknown): value is MailboxRecord {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<MailboxRecord>;
  if (maybe.version !== 1) return false;
  if (typeof maybe.id !== "string") return false;
  if (typeof maybe.spaceId !== "string") return false;
  if (typeof maybe.pageId !== "string") return false;
  if (typeof maybe.updatedAtMs !== "number") return false;
  if (typeof maybe.contentJson !== "string" && maybe.contentJson !== null) return false;
  if (typeof maybe.title !== "string" && maybe.title !== null && typeof maybe.title !== "undefined") return false;
  return true;
}

export function createMailboxCollection(storage: Storage) {
  return createCollection(
    localStorageCollectionOptions<MailboxRecord>({
      storageKey: "reactdb:mailbox",
      storage,
      getKey: (item) => item.id
    })
  );
}
