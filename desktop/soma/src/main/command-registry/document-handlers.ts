import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerDocumentHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("documents_upsert_draft", async (_event, params) => {
		await context.documents.upsertDraft(params);
		broadcastDocumentChanged(context, params, "documents_upsert_draft");
	});
	ipc.handle("documents_queue_daemon_sync", async (_event, params) => {
		await context.documents.queueDaemonSync(params);
		broadcastDocumentChanged(context, params, "documents_queue_daemon_sync");
	});
	ipc.handle("documents_sync_published", async (_event, params) => {
		const result = await context.documents.syncPublished(params);
		broadcastDocumentChanged(context, params, "documents_sync_published");
		return result;
	});
	ipc.handle("documents_get_draft", (_event, params) => context.documents.getDraft(params));
	ipc.handle("documents_ensure_page", async (_event, params) => {
		const page = await context.documents.ensurePage(params);
		broadcastPagesChanged(context, page.spaceId, "documents_ensure_page");
		return page;
	});
	ipc.handle("documents_list_pages", (_event, params) => context.documents.listPages(params));
	ipc.handle("documents_update_page_title", async (_event, params) => {
		const page = await context.documents.updatePageTitle(params);
		if (page) broadcastPagesChanged(context, page.spaceId, "documents_update_page_title");
		return page;
	});
	ipc.handle("documents_set_page_parents", async (_event, params) => {
		const page = await context.documents.setPageParents(params);
		if (page) broadcastPagesChanged(context, page.spaceId, "documents_set_page_parents");
		return page;
	});
}

type DocumentChangeParams = {
	spaceId?: string;
	documentId?: string;
} | null | undefined;

function broadcastDocumentChanged(context: CommandRegistryContext, params: DocumentChangeParams, reason: string): void {
	context.domainEvents.broadcast({
		kind: "document-changed",
		source: "renderer",
		atMs: Date.now(),
		spaceId: params?.spaceId ?? "",
		documentId: params?.documentId ?? "",
		reason,
	});
}

function broadcastPagesChanged(context: CommandRegistryContext, spaceId: string, reason: string): void {
	context.domainEvents.broadcast({
		kind: "pages-changed",
		source: "renderer",
		atMs: Date.now(),
		spaceId,
		reason,
	});
}
