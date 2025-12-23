import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log";
import { inject, injectable } from "inversify";
import { TYPES } from "../tokens";
import type { DbService } from "./db-service";

type UpsertDocumentDraftInput = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
};

type DocumentDraft = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
};

type QueueDaemonSyncInput = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
	published?: boolean;
};

type DaemonOutboxItem = {
	id: string;
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
	createdAtMs: number;
};

type StageBlobInput = {
	bytes: Uint8Array;
	mime: string;
	fileName?: string;
};

type StagedBlob = {
	blobId: string;
	mime: string;
	byteLength: number;
	createdAtMs: number;
	url: string;
};

type EnsurePageInput = {
	spaceId: string;
	pageId?: string;
	title?: string;
	parentPageIds?: string[];
};

type PageRecord = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
};

const LOCAL_BLOB_SCHEME = "soma-blob";
const LOCAL_BLOB_AUTHORITY = "local";
const LOCAL_BLOB_URL_RE = /soma-blob:\/\/local\/([0-9a-fA-F-]{10,})/g;

function nowMs(): number {
	return Date.now();
}

function ensureString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function safeBlobId(): string {
	return `${crypto.randomUUID()}--${crypto.randomUUID()}`;
}

function blobUrl(blobId: string): string {
	return `${LOCAL_BLOB_SCHEME}://${LOCAL_BLOB_AUTHORITY}/${blobId}`;
}

function safeTitle(title?: string | null): string {
	const trimmed = typeof title === "string" ? title.trim() : "";
	return trimmed || "Untitled page";
}

@injectable()
export class DocumentsService {
	private readonly logger = log.scope("documents-service");
	private initialized = false;

	constructor(@inject(TYPES.dbService) private readonly _db: DbService) {}

	init(): void {
		if (this.initialized) return;
		this.initialized = true;

		this._db.run(`
      CREATE TABLE IF NOT EXISTS documents_drafts (
        space_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        content_json TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(space_id, document_id)
      )
    `);

		this._db.run(`
      CREATE TABLE IF NOT EXISTS documents_daemon_outbox (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        content_json TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 1,
        updated_at_ms INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL
      )
    `);

		try {
			const columns = this._db.all<{ name: string }>(
				`PRAGMA table_info(documents_daemon_outbox)`,
			);
			const hasPublished = columns.some((col) => col.name === "published");
			if (!hasPublished) {
				this._db.run(
					`ALTER TABLE documents_daemon_outbox ADD COLUMN published INTEGER NOT NULL DEFAULT 1`,
				);
			}
		} catch (error) {
			this.logger.warn("Failed to ensure daemon outbox schema", error);
		}

		this._db.run(
			`CREATE INDEX IF NOT EXISTS documents_daemon_outbox_doc_idx ON documents_daemon_outbox(space_id, document_id)`,
		);

		this._db.run(`
	      CREATE TABLE IF NOT EXISTS staged_blobs (
	        blob_id TEXT PRIMARY KEY,
	        mime TEXT NOT NULL,
	        file_name TEXT,
	        byte_length INTEGER NOT NULL,
	        created_at_ms INTEGER NOT NULL,
	        last_seen_at_ms INTEGER NOT NULL
	      )
	    `);

		this._db.run(`
        CREATE TABLE IF NOT EXISTS blob_migrations (
          blob_id TEXT PRIMARY KEY,
          space_id TEXT NOT NULL,
          cid TEXT NOT NULL,
          migrated_at_ms INTEGER NOT NULL
        )
      `);

		this._db.run(`
      CREATE TABLE IF NOT EXISTS pages (
        space_id TEXT NOT NULL,
        page_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(space_id, page_id)
      )
    `);

		this._db.run(`
      CREATE TABLE IF NOT EXISTS page_parents (
        space_id TEXT NOT NULL,
        page_id TEXT NOT NULL,
        parent_page_id TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY(space_id, page_id, parent_page_id)
      )
    `);

		this._db.run(
			`CREATE INDEX IF NOT EXISTS page_parents_parent_idx ON page_parents(space_id, parent_page_id)`,
		);

		this.logger.info("Documents tables ready");
	}

	upsertDraft(input: UpsertDocumentDraftInput): void {
		this.init();

		const spaceId = ensureString(input.spaceId);
		const documentId = ensureString(input.documentId);
		const contentJson = ensureString(input.contentJson);
		const updatedAtMs = nowMs();
		const published = input.published ? 1 : 0;

		if (!spaceId || !documentId) return;

		this._db.run(
			`
        INSERT INTO documents_drafts (space_id, document_id, content_json, published, updated_at_ms)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(space_id, document_id) DO UPDATE SET
          content_json=excluded.content_json,
          published=excluded.published,
          updated_at_ms=excluded.updated_at_ms
      `,
			[spaceId, documentId, contentJson, published, updatedAtMs],
		);
	}

	getDraft(spaceId: string, documentId: string): DocumentDraft | null {
		this.init();

		return this._db.get<DocumentDraft>(
			`
        SELECT space_id as spaceId, document_id as documentId, content_json as contentJson, published as published, updated_at_ms as updatedAtMs
        FROM documents_drafts
        WHERE space_id = ? AND document_id = ?
      `,
			[spaceId, documentId],
		);
	}

	queueDaemonSync(input: QueueDaemonSyncInput): void {
		this.init();

		const spaceId = ensureString(input.spaceId);
		const documentId = ensureString(input.documentId);
		const contentJson = ensureString(input.contentJson);
		if (!spaceId || !documentId || !contentJson) return;

		const id = crypto.randomUUID();
		const published = input.published ? 1 : 0;
		const updatedAtMs = Number.isFinite(input.updatedAtMs)
			? input.updatedAtMs
			: nowMs();

		const tx = (this._db as unknown as { transaction?: unknown }).transaction;
		if (typeof tx === "function") {
			(tx as (cb: () => void) => void).call(this._db, () => {
				this._db.run(
					`DELETE FROM documents_daemon_outbox WHERE space_id = ? AND document_id = ?`,
					[spaceId, documentId],
				);
				this._db.run(
					`
          INSERT INTO documents_daemon_outbox (id, space_id, document_id, content_json, published, updated_at_ms, created_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
					[id, spaceId, documentId, contentJson, published, updatedAtMs, nowMs()],
				);
			});
		} else {
			this._db.run(
				`DELETE FROM documents_daemon_outbox WHERE space_id = ? AND document_id = ?`,
				[spaceId, documentId],
			);
			this._db.run(
				`
        INSERT INTO documents_daemon_outbox (id, space_id, document_id, content_json, published, updated_at_ms, created_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
				[id, spaceId, documentId, contentJson, published, updatedAtMs, nowMs()],
			);
		}
	}

	takeDaemonOutbox(limit = 10): DaemonOutboxItem[] {
		this.init();
		return this._db.all<DaemonOutboxItem>(
			`
        SELECT id, space_id as spaceId, document_id as documentId, content_json as contentJson, published, updated_at_ms as updatedAtMs, created_at_ms as createdAtMs
        FROM documents_daemon_outbox
        ORDER BY created_at_ms ASC
        LIMIT ?
      `,
			[limit],
		);
	}

	deleteDaemonOutboxEntries(ids: string[]): void {
		if (ids.length === 0) return;
		this.init();
		this._db.transaction(() => {
			for (const id of ids) {
				this._db.run(`DELETE FROM documents_daemon_outbox WHERE id = ?`, [id]);
			}
		});
	}

	stageBlob(input: StageBlobInput): StagedBlob {
		this.init();

		const blobId = safeBlobId();
		const userData = app.getPath("userData");
		const blobDir = join(userData, "blobs", "staged");
		mkdirSync(blobDir, { recursive: true });
		const blobPath = join(blobDir, blobId);

		writeFileSync(blobPath, input.bytes);

		const createdAtMs = nowMs();
		this._db.run(
			`
        INSERT INTO staged_blobs (blob_id, mime, file_name, byte_length, created_at_ms, last_seen_at_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
			[
				blobId,
				ensureString(input.mime, "application/octet-stream"),
				input.fileName ?? null,
				input.bytes.byteLength,
				createdAtMs,
				createdAtMs,
			],
		);

		return {
			blobId,
			mime: input.mime,
			byteLength: input.bytes.byteLength,
			createdAtMs,
			url: blobUrl(blobId),
		};
	}

	readStagedBlob(
		blobId: string,
	): { bytes: Uint8Array; mime: string; fileName: string | null } | null {
		this.init();

		const row = this._db.get<{ mime: string; fileName: string | null }>(
			`SELECT mime, file_name as fileName FROM staged_blobs WHERE blob_id = ?`,
			[blobId],
		);
		if (!row) return null;

		const blobPath = this.resolveStagedBlobPath(blobId);
		try {
			const bytes = readFileSync(blobPath);
			return { bytes: new Uint8Array(bytes), mime: row.mime, fileName: row.fileName };
		} catch {
			return null;
		}
	}

	extractLocalBlobIds(contentJson: string): string[] {
		const blobIds = new Set<string>();
		for (const match of contentJson.matchAll(LOCAL_BLOB_URL_RE)) {
			const id = match[1];
			if (id) blobIds.add(id);
		}
		return [...blobIds];
	}

	getBlobMigration(blobId: string): { cid: string } | null {
		this.init();
		return this._db.get<{ cid: string }>(
			`SELECT cid FROM blob_migrations WHERE blob_id = ?`,
			[blobId],
		);
	}

	recordBlobMigration(spaceId: string, blobId: string, cid: string): void {
		this.init();
		this._db.run(
			`
        INSERT INTO blob_migrations (blob_id, space_id, cid, migrated_at_ms)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(blob_id) DO UPDATE SET
          space_id=excluded.space_id,
          cid=excluded.cid,
          migrated_at_ms=excluded.migrated_at_ms
      `,
			[blobId, spaceId, cid, nowMs()],
		);
	}

	cleanupStagedBlobs(olderThanMs: number): number {
		this.init();

		const cutoff = nowMs() - olderThanMs;
		const rows = this._db.all<{ blobId: string }>(
			`
        SELECT blob_id as blobId
        FROM staged_blobs
        WHERE created_at_ms < ?
          AND blob_id IN (SELECT blob_id FROM blob_migrations)
      `,
			[cutoff],
		);

		let deleted = 0;
		for (const { blobId } of rows) {
			try {
				unlinkSync(this.resolveStagedBlobPath(blobId));
			} catch {
				// ignore
			}
			this._db.run(`DELETE FROM staged_blobs WHERE blob_id = ?`, [blobId]);
			deleted += 1;
		}

		if (deleted > 0) {
			this.logger.info(`Cleaned up ${deleted} staged blobs`);
		}

		return deleted;
	}

	cleanupDaemonOutbox(olderThanMs: number): number {
		this.init();

		const cutoff = nowMs() - olderThanMs;
		const rows = this._db.all<{ id: string }>(
			`SELECT id FROM documents_daemon_outbox WHERE created_at_ms < ?`,
			[cutoff],
		);

		let deleted = 0;
		for (const row of rows) {
			this._db.run(`DELETE FROM documents_daemon_outbox WHERE id = ?`, [row.id]);
			deleted += 1;
		}

		if (deleted > 0) {
			this.logger.info(`Cleaned up ${deleted} daemon outbox items`);
		}

		return deleted;
	}

	ensurePage(input: EnsurePageInput): PageRecord {
		this.init();

		const spaceId = ensureString(input.spaceId);
		if (!spaceId) {
			throw new Error("spaceId is required to ensure a page");
		}
		const pageId = ensureString(input.pageId) || safeBlobId();
		const title = safeTitle(input.title ?? pageId);
		const parentPageIds = input.parentPageIds ?? [];
		const createdAtMs = nowMs();

		const tx = (this._db as unknown as { transaction?: unknown }).transaction;
		if (typeof tx === "function") {
			(tx as (cb: () => void) => void).call(this._db, () => {
				this._db.run(
					`
          INSERT INTO pages (space_id, page_id, title, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(space_id, page_id) DO UPDATE SET
            title = COALESCE(NULLIF(excluded.title, ''), pages.title),
            updated_at_ms = CASE WHEN excluded.title != pages.title THEN excluded.updated_at_ms ELSE pages.updated_at_ms END
        `,
					[spaceId, pageId, title, createdAtMs, createdAtMs],
				);
				this.replacePageParents(spaceId, pageId, parentPageIds);
			});
		} else {
			this._db.run(
				`
          INSERT INTO pages (space_id, page_id, title, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(space_id, page_id) DO UPDATE SET
            title = COALESCE(NULLIF(excluded.title, ''), pages.title),
            updated_at_ms = CASE WHEN excluded.title != pages.title THEN excluded.updated_at_ms ELSE pages.updated_at_ms END
        `,
				[spaceId, pageId, title, createdAtMs, createdAtMs],
			);
			this.replacePageParents(spaceId, pageId, parentPageIds);
		}

		const page = this.getPage(spaceId, pageId);
		if (!page) {
			throw new Error(`Failed to ensure page ${spaceId}/${pageId}`);
		}
		return page;
	}

	updatePageTitle(spaceId: string, pageId: string, title: string): PageRecord | null {
		this.init();
		const nextTitle = safeTitle(title);
		this._db.run(
			`UPDATE pages SET title = ?, updated_at_ms = ? WHERE space_id = ? AND page_id = ?`,
			[nextTitle, nowMs(), spaceId, pageId],
		);
		return this.getPage(spaceId, pageId);
	}

	setPageParents(spaceId: string, pageId: string, parentPageIds: string[]): PageRecord | null {
		this.init();
		const tx = (this._db as unknown as { transaction?: unknown }).transaction;
		if (typeof tx === "function") {
			(tx as (cb: () => void) => void).call(this._db, () => {
				this.replacePageParents(spaceId, pageId, parentPageIds);
				this._db.run(
					`UPDATE pages SET updated_at_ms = ? WHERE space_id = ? AND page_id = ?`,
					[nowMs(), spaceId, pageId],
				);
			});
		} else {
			this.replacePageParents(spaceId, pageId, parentPageIds);
			this._db.run(
				`UPDATE pages SET updated_at_ms = ? WHERE space_id = ? AND page_id = ?`,
				[nowMs(), spaceId, pageId],
			);
		}
		return this.getPage(spaceId, pageId);
	}

	getPage(spaceId: string, pageId: string): PageRecord | null {
		this.init();
		const row = this._db.get<{
			spaceId: string;
			pageId: string;
			title: string;
			createdAtMs: number;
			updatedAtMs: number;
		}>(
			`
        SELECT space_id as spaceId, page_id as pageId, title, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs
        FROM pages
        WHERE space_id = ? AND page_id = ?
      `,
			[spaceId, pageId],
		);
		if (!row) return null;

		const parents = this._db.all<{ parentPageId: string }>(
			`SELECT parent_page_id as parentPageId FROM page_parents WHERE space_id = ? AND page_id = ?`,
			[spaceId, pageId],
		);

		return {
			...row,
			parentPageIds: parents.map((p) => p.parentPageId),
		};
	}

	listPages(spaceId: string): PageRecord[] {
		this.init();
		const rows = this._db.all<{
			spaceId: string;
			pageId: string;
			title: string;
			createdAtMs: number;
			updatedAtMs: number;
		}>(
			`
        SELECT space_id as spaceId, page_id as pageId, title, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs
        FROM pages
        WHERE space_id = ?
        ORDER BY title
      `,
			[spaceId],
		);

		const parents = this._db.all<{ pageId: string; parentPageId: string }>(
			`SELECT page_id as pageId, parent_page_id as parentPageId FROM page_parents WHERE space_id = ?`,
			[spaceId],
		);
		const parentsByPage = new Map<string, string[]>();
		for (const { pageId, parentPageId } of parents) {
			const list = parentsByPage.get(pageId) ?? [];
			list.push(parentPageId);
			parentsByPage.set(pageId, list);
		}

		return rows.map((row) => ({
			...row,
			parentPageIds: parentsByPage.get(row.pageId) ?? [],
		}));
	}

	private replacePageParents(spaceId: string, pageId: string, parentPageIds: string[]): void {
		const uniqueParents = Array.from(
			new Set(parentPageIds.map((p) => ensureString(p).trim()).filter(Boolean)),
		);
		this._db.run(`DELETE FROM page_parents WHERE space_id = ? AND page_id = ?`, [
			spaceId,
			pageId,
		]);
		for (const parentId of uniqueParents) {
			this._db.run(
				`
          INSERT INTO page_parents (space_id, page_id, parent_page_id, created_at_ms)
          VALUES (?, ?, ?, ?)
        `,
				[spaceId, pageId, parentId, nowMs()],
			);
		}
	}

	private resolveStagedBlobPath(blobId: string): string {
		const userData = app.getPath("userData");
		return join(userData, "blobs", "staged", blobId);
	}
}

export { LOCAL_BLOB_AUTHORITY, LOCAL_BLOB_SCHEME };
export type {
	DaemonOutboxItem,
	PageRecord,
	StagedBlob,
	UpsertDocumentDraftInput,
};
