/**
 * Documents service. Page / document commands migrate to `@soma/sdk`;
 * the *draft* commands (`documents_get_draft`, `documents_upsert_draft`,
 * `documents_queue_daemon_sync`, `documents_sync_published`) stay on
 * the raw `invoke()` helper for now because they target Electron-only
 * controllers that don't have a Tauri counterpart yet.
 */

import { createId } from "@paralleldrive/cuid2";
import type { StoredPage } from "@soma/sdk";
import { backend, invoke } from "../lib/ipc";

type DraftRecord = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
};

export type PageRecord = StoredPage;

export async function getDraft(input: { spaceId: string; documentId: string }): Promise<DraftRecord | null> {
	return invoke<DraftRecord | null>("documents_get_draft", input).catch(() => null);
}

export async function upsertDraft(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
}): Promise<{ ok: true }> {
	await invoke("documents_upsert_draft", input);
	return { ok: true };
}

export async function queueDaemonSync(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
	published?: boolean;
}): Promise<{ ok: true }> {
	await invoke("documents_queue_daemon_sync", input);
	return { ok: true };
}

export async function syncPublishedDocument(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
}): Promise<{ ok: true; uploaded: number }> {
	const result = await invoke<{ uploaded: number }>("documents_sync_published", input).catch(() => ({ uploaded: 0 }));
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
