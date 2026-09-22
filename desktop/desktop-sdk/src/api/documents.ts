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
		// Local write (published: true) + local `document-changed` UI event.
		// Real p2p replication (`/soma/doc-sync/1`) is automatic — it fires
		// on write, connect, join, and learning new members — so this call
		// does not itself sync or upload anything over the network.
		publish: (args: B.PublishDocumentArgs) => t.invoke<void>("documents_publish", { args }),
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
