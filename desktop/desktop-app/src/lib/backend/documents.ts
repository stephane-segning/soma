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
	upsert: (args: UpsertDocumentArgs) => call<void>("upsert_document", { args }),
	get: (spaceId: string, documentId: string) => call<StoredDocument | null>("get_document", { spaceId, documentId }),
};

export const pages = {
	ensure: (args: EnsurePageArgs) => call<StoredPage>("ensure_page", { args }),
	list: (spaceId: string) => call<StoredPage[]>("list_pages", { spaceId }),
	updateTitle: (args: UpdatePageTitleArgs) => call<StoredPage | null>("update_page_title", { args }),
	setParents: (args: SetPageParentsArgs) => call<StoredPage | null>("set_page_parents", { args }),
};
