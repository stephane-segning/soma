type DraftRecord = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
};

export async function getDraft(input: {
	spaceId: string;
	documentId: string;
}): Promise<DraftRecord | null> {
	return window.api.documents.getDraft(input);
}

export async function upsertDraft(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
}): Promise<{ ok: true }> {
	return window.api.documents.upsertDraft(input);
}

export async function queueDaemonSync(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
	published?: boolean;
}): Promise<{ ok: true }> {
	return window.api.documents.queueDaemonSync(input);
}

export async function syncPublishedDocument(input: {
	spaceId: string;
	documentId: string;
	contentJson: string;
	updatedAtMs: number;
}): Promise<{ ok: true; uploaded: number }> {
	return window.api.daemon.syncPublishedDocument(input);
}

export async function ensurePage(input: {
	spaceId: string;
	pageId?: string;
	title?: string;
	parentPageIds?: string[];
}) {
	return window.api.documents.ensurePage(input);
}

export async function listPages(input: { spaceId: string }) {
	return window.api.documents.listPages(input);
}

export async function updatePageTitle(input: {
	spaceId: string;
	pageId: string;
	title: string;
}) {
	return window.api.documents.updatePageTitle(input);
}

export async function setPageParents(input: {
	spaceId: string;
	pageId: string;
	parentPageIds: string[];
}) {
	return window.api.documents.setPageParents(input);
}

