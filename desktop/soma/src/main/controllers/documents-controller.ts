import { createId } from "@paralleldrive/cuid2";
import {
	DaemonClient,
	type StoredDocument,
	type StoredPage,
} from "../services/daemon-client";

export type DraftRecord = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: number;
	updatedAtMs: number;
};

export type PageRecord = StoredPage;

export class DocumentsController {
	constructor(private readonly daemon: DaemonClient) {}

	async upsertDraft(params: {
		spaceId: string;
		documentId: string;
		contentJson: string;
		published: boolean;
		updatedAtMs?: number;
	}): Promise<void> {
		const payload: StoredDocument = {
			spaceId: params.spaceId,
			documentId: params.documentId,
			contentJson: params.contentJson,
			published: params.published,
			updatedAtMs: params.updatedAtMs ?? Date.now(),
		};
		await this.daemon.upsertDocument(payload);
	}

	async queueDaemonSync(params: {
		spaceId: string;
		documentId: string;
		contentJson: string;
		updatedAtMs: number;
		published?: boolean;
	}): Promise<void> {
		const payload: StoredDocument = {
			spaceId: params.spaceId,
			documentId: params.documentId,
			contentJson: params.contentJson,
			published: params.published ?? true,
			updatedAtMs: params.updatedAtMs,
		};
		await this.daemon.upsertDocument(payload);
	}

	async syncPublished(params: {
		spaceId: string;
		documentId: string;
		contentJson: string;
		updatedAtMs: number;
	}): Promise<number> {
		const payload: StoredDocument = {
			spaceId: params.spaceId,
			documentId: params.documentId,
			contentJson: params.contentJson,
			published: true,
			updatedAtMs: params.updatedAtMs,
		};
		await this.daemon.upsertDocument(payload);
		return 1;
	}

	async getDraft(input: {
		spaceId: string;
		documentId: string;
	}): Promise<DraftRecord | null> {
		const doc = await this.daemon.getDocument(input.spaceId, input.documentId);
		if (!doc) return null;
		return {
			spaceId: doc.spaceId,
			documentId: doc.documentId,
			contentJson: doc.contentJson,
			published: doc.published ? 1 : 0,
			updatedAtMs: doc.updatedAtMs,
		};
	}

	async ensurePage(input: {
		spaceId: string;
		pageId?: string;
		title?: string;
		parentPageIds?: string[];
		createdAtMs?: number;
		updatedAtMs?: number;
	}): Promise<PageRecord> {
		const now = Date.now();
		const page: StoredPage = {
			spaceId: input.spaceId,
			pageId: input.pageId ?? createId(),
			title: input.title ?? "",
			parentPageIds: input.parentPageIds ?? [],
			createdAtMs: input.createdAtMs ?? now,
			updatedAtMs: input.updatedAtMs ?? now,
		};
		return this.daemon.ensurePage(page);
	}

	async listPages(input: { spaceId: string }): Promise<PageRecord[]> {
		return this.daemon.listPages(input.spaceId);
	}

	async updatePageTitle(input: {
		spaceId: string;
		pageId: string;
		title: string;
	}): Promise<PageRecord | null> {
		return this.daemon.updatePageTitle(
			input.spaceId,
			input.pageId,
			input.title,
		);
	}

	async setPageParents(input: {
		spaceId: string;
		pageId: string;
		parentPageIds: string[];
	}): Promise<PageRecord | null> {
		return this.daemon.setPageParents(
			input.spaceId,
			input.pageId,
			input.parentPageIds,
		);
	}
}
