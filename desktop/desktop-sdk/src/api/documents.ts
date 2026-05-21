import type * as B from "../bindings";
import type { Transport } from "../transport";

export function documents(t: Transport) {
	return {
		upsert: (args: B.UpsertDocumentArgs) => t.invoke<void>("documents_upsert", { args }),
		get: (spaceId: string, documentId: string) =>
			t.invoke<B.StoredDocument | null>("documents_get", { spaceId, documentId }),

		// --- Drafts surface ---
		//
		// Wire types are emitted by specta into `../bindings/index.ts` from
		// the Rust DTOs in `desktop-api::documents`. Both transports
		// (Electron and Tauri) now resolve these commands.
		getDraft: (args: B.GetDraftArgs) => t.invoke<B.DraftRecord | null>("documents_get_draft", { args }),
		upsertDraft: (args: B.UpsertDraftArgs) => t.invoke<void>("documents_upsert_draft", { args }),
		queueDaemonSync: (args: B.QueueDaemonSyncArgs) => t.invoke<void>("documents_queue_daemon_sync", { args }),
		syncPublishedDocument: (args: B.SyncPublishedDocumentArgs) =>
			t.invoke<B.SyncPublishedDocumentResult>("documents_sync_published", { args }),
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
