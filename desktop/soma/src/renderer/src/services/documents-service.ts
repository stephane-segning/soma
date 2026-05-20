/**
 * Documents service. Page / document commands route through `@soma/sdk`
 * (`backend.pages.*` / `backend.documents.*`). The draft commands are
 * SDK-typed but still resolve against the Electron transport only —
 * the Tauri presenter doesn't implement `documents_get_draft`,
 * `documents_upsert_draft`, `documents_queue_daemon_sync`, or
 * `documents_sync_published` yet.
 */

import { createId } from "@paralleldrive/cuid2";
import type { DraftRecord, StoredPage } from "@soma/sdk";
import { backend } from "../lib/ipc";

export type PageRecord = StoredPage;

export async function getDraft(input: { spaceId: string; documentId: string }): Promise<DraftRecord | null> {
	return backend.documents.getDraft(input).catch(() => null);
}

export async function upsertDraft(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
}): Promise<{ ok: true }> {
	await backend.documents.upsertDraft(input);
	return { ok: true };
}

export async function queueDaemonSync(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
	published?: boolean;
}): Promise<{ ok: true }> {
	await backend.documents.queueDaemonSync(input);
	return { ok: true };
}

export async function syncPublishedDocument(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
}): Promise<{ ok: true; uploaded: number }> {
	const result = await backend.documents.syncPublishedDocument(input).catch(() => ({ uploaded: 0 }));
	return { ok: true, uploaded: result.uploaded };
}

export async function ensurePage(input: {
	spaceId: string;
	pageId?: string;
	title?: string;
	parentPageIds?: string[];
}): Promise<PageRecord> {
	return backend.pages.ensure({
		spaceId: input.spaceId,
		pageId: input.pageId && input.pageId.trim().length > 0 ? input.pageId : createId(),
		title: input.title ?? "",
		parentPageIds: input.parentPageIds ?? [],
	});
}

export async function listPages(input: { spaceId: string }): Promise<PageRecord[]> {
	return backend.pages.list(input.spaceId).catch(() => []);
}

export async function updatePageTitle(input: {
	spaceId: string;
	pageId: string;
	title: string;
}): Promise<PageRecord | null> {
	return backend.pages.updateTitle(input).catch(() => null);
}

export async function setPageParents(input: {
	spaceId: string;
	pageId: string;
	parentPageIds: string[];
}): Promise<PageRecord | null> {
	return backend.pages.setParents(input).catch(() => null);
}
