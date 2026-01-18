import { createId } from "@paralleldrive/cuid2";
import { invoke } from "../lib/ipc";

type DraftRecord =
	{
		spaceId: string;
		documentId: string;
		contentJson: string;
		published:
			| 0
			| 1;
		updatedAtMs: number;
	};

type PageRecord =
	{
		spaceId: string;
		pageId: string;
		title: string;
		parentPageIds: string[];
		createdAtMs: number;
		updatedAtMs: number;
	};

export async function getDraft(input: {
	spaceId: string;
	documentId: string;
}): Promise<DraftRecord | null> {
	return invoke<DraftRecord | null>(
		"documents_get_draft",
		input,
	).catch(
		() =>
			null,
	);
}

export async function upsertDraft(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
}): Promise<{
	ok: true;
}> {
	await invoke(
		"documents_upsert_draft",
		input,
	);
	return {
		ok: true,
	};
}

export async function queueDaemonSync(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
	published?: boolean;
}): Promise<{
	ok: true;
}> {
	await invoke(
		"documents_queue_daemon_sync",
		input,
	);
	return {
		ok: true,
	};
}

export async function syncPublishedDocument(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
}): Promise<{
	ok: true;
	uploaded: number;
}> {
	const result =
		await invoke<{
			uploaded: number;
		}>(
			"documents_sync_published",
			input,
		).catch(
			() => ({
				uploaded: 0,
			}),
		);
	return {
		ok: true,
		uploaded:
			result.uploaded,
	};
}

export async function ensurePage(input: {
	spaceId: string;
	pageId?: string;
	title?: string;
	parentPageIds?: string[];
}): Promise<PageRecord> {
	const payload =
		{
			...input,
			pageId:
				input.pageId &&
				input.pageId.trim()
					.length >
					0
					? input.pageId
					: createId(),
			title:
				input.title,
			parentPageIds:
				input.parentPageIds ??
				[],
		};
	return invoke<PageRecord>(
		"documents_ensure_page",
		payload,
	);
}

export async function listPages(input: {
	spaceId: string;
}): Promise<
	PageRecord[]
> {
	return invoke<
		PageRecord[]
	>(
		"documents_list_pages",
		input,
	).catch(
		() => [],
	);
}

export async function updatePageTitle(input: {
	spaceId: string;
	pageId: string;
	title: string;
}): Promise<PageRecord | null> {
	return invoke<PageRecord | null>(
		"documents_update_page_title",
		input,
	).catch(
		() =>
			null,
	);
}

export async function setPageParents(input: {
	spaceId: string;
	pageId: string;
	parentPageIds: string[];
}): Promise<PageRecord | null> {
	return invoke<PageRecord | null>(
		"documents_set_page_parents",
		input,
	).catch(
		() =>
			null,
	);
}
