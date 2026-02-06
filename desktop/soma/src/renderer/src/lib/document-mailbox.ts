import { mailboxCollection } from "@app/lib/db";
import { createMailboxRecord, isMailboxRecord, mailboxRecordId, mailboxRecordToEntry, type MailboxEntry } from "@soma/desktop-db";

function mailboxKey(spaceId: string, pageId: string): string {
	return mailboxRecordId(spaceId, pageId);
}

function readMailbox(spaceId: string, pageId: string): MailboxEntry | null {
	try {
		const record = mailboxCollection.state.get(mailboxKey(spaceId, pageId));
		if (!record || !isMailboxRecord(record)) return null;
		return mailboxRecordToEntry(record);
	} catch {
		return null;
	}
}

function writeMailbox(spaceId: string, pageId: string, entry: MailboxEntry): void {
	try {
		const record = createMailboxRecord(spaceId, pageId, entry);
		const existing = mailboxCollection.state.get(record.id);
		if (existing) {
			mailboxCollection.update(record.id, (draft) => {
				draft.version = record.version;
				draft.spaceId = record.spaceId;
				draft.pageId = record.pageId;
				draft.updatedAtMs = record.updatedAtMs;
				draft.contentJson = record.contentJson;
				draft.title = record.title;
			});
			return;
		}
		mailboxCollection.insert(record);
	} catch {
		// ignore storage write failures
	}
}

export type { MailboxEntry };
export { mailboxKey, readMailbox, writeMailbox };
