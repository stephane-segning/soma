import { BrowserWindow, type IpcMain } from "electron";
import type { AgentController } from "./controllers/agent-controller";
import type { BlobsController } from "./controllers/blobs-controller";
import type { DbStorageController } from "./controllers/db-storage-controller";
import type { DocumentsController } from "./controllers/documents-controller";
import type { SearchController } from "./controllers/search-controller";
import type { SettingsController } from "./controllers/settings-controller";
import type { SpacesController } from "./controllers/spaces-controller";
import type { WindowController } from "./controllers/window-controller";
import type { DomainEventsService } from "./services/domain-events";
import type { AppLogger } from "./services/logger";

export class CommandRegistry {
	constructor(
		private readonly blobs: BlobsController,
		private readonly documents: DocumentsController,
		private readonly spaces: SpacesController,
		private readonly agent: AgentController,
		private readonly search: SearchController,
		private readonly settings: SettingsController,
		private readonly dbStorage: DbStorageController,
		private readonly domainEvents: DomainEventsService,
		private readonly windows: WindowController,
		private readonly logger: AppLogger,
	) {}

	register(ipc: IpcMain): void {
		ipc.handle("blobs_stage", (_event, params) => this.blobs.stage(params));
		ipc.handle("blobs_stage_payload", (_event, params) => this.blobs.stagePayload(params));
		ipc.handle("blobs_stage_from_payload", (_event, params) => this.blobs.stageFromPayload(params));

		ipc.handle("documents_upsert_draft", async (_event, params) => {
			await this.documents.upsertDraft(params);
			this.domainEvents.broadcast({
				kind: "document-changed",
				source: "renderer",
				atMs: Date.now(),
				spaceId: params?.spaceId ?? "",
				documentId: params?.documentId ?? "",
				reason: "documents_upsert_draft",
			});
		});
		ipc.handle("documents_queue_daemon_sync", async (_event, params) => {
			await this.documents.queueDaemonSync(params);
			this.domainEvents.broadcast({
				kind: "document-changed",
				source: "renderer",
				atMs: Date.now(),
				spaceId: params?.spaceId ?? "",
				documentId: params?.documentId ?? "",
				reason: "documents_queue_daemon_sync",
			});
		});
		ipc.handle("documents_sync_published", async (_event, params) => {
			const result = await this.documents.syncPublished(params);
			this.domainEvents.broadcast({
				kind: "document-changed",
				source: "renderer",
				atMs: Date.now(),
				spaceId: params?.spaceId ?? "",
				documentId: params?.documentId ?? "",
				reason: "documents_sync_published",
			});
			return result;
		});
		ipc.handle("documents_get_draft", (_event, params) => this.documents.getDraft(params));
		ipc.handle("documents_ensure_page", async (_event, params) => {
			const page = await this.documents.ensurePage(params);
			this.domainEvents.broadcast({
				kind: "pages-changed",
				source: "renderer",
				atMs: Date.now(),
				spaceId: page.spaceId,
				reason: "documents_ensure_page",
			});
			return page;
		});
		ipc.handle("documents_list_pages", (_event, params) => this.documents.listPages(params));
		ipc.handle("documents_update_page_title", async (_event, params) => {
			const page = await this.documents.updatePageTitle(params);
			if (page) {
				this.domainEvents.broadcast({
					kind: "pages-changed",
					source: "renderer",
					atMs: Date.now(),
					spaceId: page.spaceId,
					reason: "documents_update_page_title",
				});
			}
			return page;
		});
		ipc.handle("documents_set_page_parents", async (_event, params) => {
			const page = await this.documents.setPageParents(params);
			if (page) {
				this.domainEvents.broadcast({
					kind: "pages-changed",
					source: "renderer",
					atMs: Date.now(),
					spaceId: page.spaceId,
					reason: "documents_set_page_parents",
				});
			}
			return page;
		});

		ipc.handle("agent_chat_stream", (_event, params) => this.agent.chatStream(params?.messages ?? [], params ?? {}));
		ipc.handle("agent_list_models", (_event, params) => this.agent.listModels(params?.spaceId ?? params?.workspaceId));
		ipc.handle("agent_rerank", (_event, params) =>
			this.agent.rerank({
				query: params?.query ?? "",
				candidates: params?.candidates ?? [],
				model: params?.model,
				topN: params?.topN ?? params?.top_n ?? 0,
				spaceId: params?.spaceId ?? params?.workspaceId,
			}),
		);
		ipc.handle("agent_resolve_drift", (_event, params) =>
			this.agent.resolveDrift({
				leftUpdateBase64: params?.leftUpdateBase64 ?? params?.left_update_base64 ?? "",
				rightUpdateBase64: params?.rightUpdateBase64 ?? params?.right_update_base64 ?? "",
			}),
		);
		ipc.handle("agent_enqueue_background_task", (_event, params) =>
			this.agent.enqueueBackgroundTask({
				kind: params?.kind ?? "research-selection",
				spaceId: params?.spaceId ?? params?.workspaceId ?? "",
				documentId: params?.documentId ?? params?.docId ?? "",
				selectionText: params?.selectionText ?? "",
				model: params?.model,
				persistInDocument: params?.persistInDocument ?? false,
			}),
		);
		ipc.handle("agent_list_background_tasks", (_event, params) =>
			this.agent.listBackgroundTasks({
				spaceId: params?.spaceId ?? params?.workspaceId,
				limit: params?.limit ?? 50,
			}),
		);

		ipc.handle("search", (_event, params) => this.search.search(params?.query ?? ""));

		ipc.handle("spaces_list", (_event, params) => this.spaces.list(params));
		ipc.handle("spaces_list_members", (_event, params) => this.spaces.listMembers(params?.spaceId ?? ""));
		ipc.handle("spaces_list_my_memberships", () => this.spaces.listMyMemberships());
		ipc.handle("spaces_join", (_event, params) =>
			this.spaces.join({
				spaceId: params?.spaceId ?? "",
				targetPeerId: params?.targetPeerId ?? "",
				targetMultiaddrs: params?.targetMultiaddrs ?? [],
				displayName: params?.displayName,
				deviceName: params?.deviceName,
			}),
		);
		ipc.handle("spaces_list_join_requests", () => this.spaces.listJoinRequests());
		ipc.handle("spaces_decide_join", async (_event, params) => {
			const result = await this.spaces.decideJoin({
				requestId: params?.requestId ?? "",
				approve: params?.approve === true,
				role: params?.role,
				reason: params?.reason,
			});

			if (result?.spaceId) {
				this.domainEvents.broadcast({
					kind: "space-changed",
					source: "renderer",
					atMs: Date.now(),
					spaceId: result.spaceId,
					reason: "spaces_decide_join",
				});
			}

			this.domainEvents.broadcast({
				kind: "spaces-changed",
				source: "renderer",
				atMs: Date.now(),
				reason: "spaces_decide_join",
			});

			return result;
		});
		ipc.handle("spaces_revoke_member", async (_event, params) => {
			const accepted = await this.spaces.revokeMembership({
				spaceId: params?.spaceId ?? "",
				subjectPeerId: params?.subjectPeerId ?? "",
				reason: params?.reason,
			});

			if (accepted && params?.spaceId) {
				this.domainEvents.broadcast({
					kind: "space-changed",
					source: "renderer",
					atMs: Date.now(),
					spaceId: params.spaceId,
					reason: "spaces_revoke_member",
				});
			}
			if (accepted) {
				this.domainEvents.broadcast({
					kind: "spaces-changed",
					source: "renderer",
					atMs: Date.now(),
					reason: "spaces_revoke_member",
				});
			}

			return accepted;
		});
		ipc.handle("spaces_create", async (_event, params) => {
			const space = await this.spaces.create(params ?? {});
			this.domainEvents.broadcast({
				kind: "spaces-changed",
				source: "renderer",
				atMs: Date.now(),
				reason: "spaces_create",
			});
			return space;
		});
		ipc.handle("spaces_get", (_event, params) => this.spaces.get(params?.spaceId));
		ipc.handle("spaces_update", async (_event, params) => {
			const space = await this.spaces.update(params);
			this.domainEvents.broadcast({
				kind: "space-changed",
				source: "renderer",
				atMs: Date.now(),
				spaceId: space.spaceId,
				reason: "spaces_update",
			});
			return space;
		});
		ipc.handle("spaces_delete", async (_event, params) => {
			const result = await this.spaces.delete(params?.spaceId ?? "");
			this.domainEvents.broadcast({
				kind: "spaces-changed",
				source: "renderer",
				atMs: Date.now(),
				reason: "spaces_delete",
			});
			return result;
		});

		ipc.handle("settings_get", (_event, params) => this.settings.get(params?.key));
		ipc.handle("settings_set", (_event, params) => {
			this.settings.set(params?.key, params?.value);
		});

		ipc.on("db_storage_get", (event, key) => {
			const targetKey = typeof key === "string" ? key : key?.key;
			event.returnValue = targetKey ? this.dbStorage.getItem(targetKey) : null;
		});

		ipc.on("db_storage_set", (event, payload) => {
			const key = typeof payload?.key === "string" ? payload.key : "";
			const value = typeof payload?.value === "string" ? payload.value : "";
			if (key) this.dbStorage.setItem(key, value);
			event.returnValue = true;
		});

		ipc.on("db_storage_remove", (event, key) => {
			const targetKey = typeof key === "string" ? key : key?.key;
			if (targetKey) this.dbStorage.removeItem(targetKey);
			event.returnValue = true;
		});

		ipc.on("db_storage_clear", (event) => {
			this.dbStorage.clear();
			event.returnValue = true;
		});

		ipc.on("db_storage_keys", (event) => {
			event.returnValue = this.dbStorage.keys();
		});

		ipc.handle("window:control", (event, params) => {
			const window = BrowserWindow.fromWebContents(event.sender);
			if (!window) return;
			switch (params?.action) {
				case "minimize":
					return this.windows.minimize(window);
				case "toggleMaximize":
					return this.windows.toggleMaximize(window);
				case "close":
					return this.windows.close(window);
				default:
					return;
			}
		});

		ipc.handle("log:message", (_event, params) => {
			const level = normalizeLogLevel(params?.level ?? "info");
			const message = params?.message ?? "";
			this.logger.log(level, message);
		});
	}
}

function normalizeLogLevel(level: string): "error" | "warn" | "info" | "debug" {
	switch (level) {
		case "error":
			return "error";
		case "warn":
			return "warn";
		case "debug":
			return "debug";
		case "info":
		case "log":
		default:
			return "info";
	}
}
