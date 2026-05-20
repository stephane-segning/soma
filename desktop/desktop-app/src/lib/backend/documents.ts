import { call } from "./client";
import type {
	EnsurePageArgs,
	SetPageParentsArgs,
	StoredDocument,
	StoredPage,
	UpdatePageTitleArgs,
	UpsertDocumentArgs,
} from "./types";

export const documents = {
	upsert: (args: UpsertDocumentArgs) => call<void>("documents_upsert", { args }),
	get: (spaceId: string, documentId: string) => call<StoredDocument | null>("documents_get", { spaceId, documentId }),
};

export const pages = {
	ensure: (args: EnsurePageArgs) => call<StoredPage>("documents_ensure_page", { args }),
	list: (spaceId: string) => call<StoredPage[]>("documents_list_pages", { spaceId }),
	updateTitle: (args: UpdatePageTitleArgs) => call<StoredPage | null>("documents_update_page_title", { args }),
	setParents: (args: SetPageParentsArgs) => call<StoredPage | null>("documents_set_page_parents", { args }),
};
