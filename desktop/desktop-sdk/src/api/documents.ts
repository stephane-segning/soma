import type * as B from "../bindings";
import type { Transport } from "../transport";

export function documents(t: Transport) {
	return {
		upsert: (args: B.UpsertDocumentArgs) => t.invoke<void>("documents_upsert", { args }),
		get: (spaceId: string, documentId: string) =>
			t.invoke<B.StoredDocument | null>("documents_get", { spaceId, documentId }),

		// --- Drafts surface ---
		//
		// The four draft commands below resolve against the Electron transport
		// only — the Tauri presenter does not implement them yet (TODO: port
		// `documents_get_draft`, `documents_upsert_draft`, `documents_queue_daemon_sync`,
		// and `documents_sync_published` to the Rust side). Types are declared
		// by hand here instead of pulled from `../bindings` because the Rust
		// surface that would generate them is still missing.
		getDraft: (args: GetDraftArgs) => t.invoke<DraftRecord | null>("documents_get_draft", { args }),
		upsertDraft: (args: UpsertDraftArgs) => t.invoke<void>("documents_upsert_draft", { args }),
		queueDaemonSync: (args: QueueDaemonSyncArgs) => t.invoke<void>("documents_queue_daemon_sync", { args }),
		syncPublishedDocument: (args: SyncPublishedDocumentArgs) =>
			t.invoke<SyncPublishedDocumentResult>("documents_sync_published", { args }),
	};
}

export function pages(t: Transport) {
	return {
		ensure: (args: B.EnsurePageArgs) => t.invoke<B.StoredPage>("documents_ensure_page", { args }),
		list: (spaceId: string) => t.invoke<B.StoredPage[]>("documents_list_pages", { spaceId }),
		updateTitle: (args: B.UpdatePageTitleArgs) =>
			t.invoke<B.StoredPage | null>("documents_update_page_title", { args }),
		setParents: (args: B.SetPageParentsArgs) => t.invoke<B.StoredPage | null>("documents_set_page_parents", { args }),
	};
}

// --- Draft types (Electron-only for now; mirror the Rust schema if/when it lands) ---

export type DraftRecord = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
};

export type GetDraftArgs = {
	spaceId: string;
	documentId: string;
};

export type UpsertDraftArgs = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
};

export type QueueDaemonSyncArgs = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
	published?: boolean;
};

export type SyncPublishedDocumentArgs = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
};

export type SyncPublishedDocumentResult = {
	uploaded: number;
};
