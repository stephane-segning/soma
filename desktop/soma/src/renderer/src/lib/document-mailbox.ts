import { mailboxCollection } from "@app/lib/db";
import {
	createMailboxRecord,
	isMailboxRecord,
	type MailboxEntry,
	mailboxRecordId,
	mailboxRecordToEntry,
} from "@soma/desktop-db";

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
				draft.baseDaemonUpdatedAtMs = record.baseDaemonUpdatedAtMs;
				draft.conflictState = record.conflictState;
			});
			return;
		}
		mailboxCollection.insert(record);
	} catch {
		// ignore storage write failures
	}
}

function removeMailbox(spaceId: string, pageId: string): void {
	try {
		mailboxCollection.delete(mailboxKey(spaceId, pageId));
	} catch {
		// ignore storage write failures
	}
}

function applyRemoteMailboxPolicy(input: {
	spaceId: string;
	pageId: string;
	daemonUpdatedAtMs: number;
}): "noop" | "cleared_stale_local" | "kept_local_ahead" {
	const current = readMailbox(input.spaceId, input.pageId);
	if (!current) return "noop";

	if (current.updatedAtMs <= input.daemonUpdatedAtMs) {
		removeMailbox(input.spaceId, input.pageId);
		return "cleared_stale_local";
	}

	writeMailbox(input.spaceId, input.pageId, {
		...current,
		baseDaemonUpdatedAtMs: input.daemonUpdatedAtMs,
		conflictState: "ahead",
	});
	return "kept_local_ahead";
}

export type { MailboxEntry };
export { applyRemoteMailboxPolicy, mailboxKey, readMailbox, removeMailbox, writeMailbox };
