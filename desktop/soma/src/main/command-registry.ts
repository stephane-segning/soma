import { BrowserWindow, type IpcMain } from "electron";
import type { AgentController } from "./controllers/agent-controller";
import type { BlobsController } from "./controllers/blobs-controller";
import type { DocumentsController } from "./controllers/documents-controller";
import type { SearchController } from "./controllers/search-controller";
import type { SettingsController } from "./controllers/settings-controller";
import type { SpacesController } from "./controllers/spaces-controller";
import type { WindowController } from "./controllers/window-controller";

export class CommandRegistry {
	constructor(
		private readonly blobs: BlobsController,
		private readonly documents: DocumentsController,
		private readonly spaces: SpacesController,
		private readonly agent: AgentController,
		private readonly search: SearchController,
		private readonly settings: SettingsController,
		private readonly windows: WindowController,
	) {}

	register(ipc: IpcMain): void {
		ipc.handle("blobs_stage", (_event, params) => this.blobs.stage(params));

		ipc.handle("documents_upsert_draft", (_event, params) =>
			this.documents.upsertDraft(params),
		);
		ipc.handle("documents_queue_daemon_sync", (_event, params) =>
			this.documents.queueDaemonSync(params),
		);
		ipc.handle("documents_sync_published", (_event, params) =>
			this.documents.syncPublished(params),
		);
		ipc.handle("documents_get_draft", (_event, params) =>
			this.documents.getDraft(params),
		);
		ipc.handle("documents_ensure_page", (_event, params) =>
			this.documents.ensurePage(params),
		);
		ipc.handle("documents_list_pages", (_event, params) =>
			this.documents.listPages(params),
		);
		ipc.handle("documents_update_page_title", (_event, params) =>
			this.documents.updatePageTitle(params),
		);
		ipc.handle("documents_set_page_parents", (_event, params) =>
			this.documents.setPageParents(params),
		);

		ipc.handle("agent_chat_stream", (_event, params) =>
			this.agent.chatStream(params?.messages ?? [], params ?? {}),
		);
		ipc.handle("agent_list_models", () => this.agent.listModels());

		ipc.handle("search", (_event, params) =>
			this.search.search(params?.query ?? ""),
		);

		ipc.handle("spaces_list", (_event, params) => this.spaces.list(params));
		ipc.handle("spaces_list_members", (_event, params) =>
			this.spaces.listMembers(params?.spaceId ?? ""),
		);
		ipc.handle("spaces_create", (_event, params) =>
			this.spaces.create(params ?? {}),
		);
		ipc.handle("spaces_get", (_event, params) =>
			this.spaces.get(params?.spaceId),
		);
		ipc.handle("spaces_update", (_event, params) => this.spaces.update(params));
		ipc.handle("spaces_delete", (_event, params) =>
			this.spaces.delete(params?.spaceId ?? ""),
		);

		ipc.handle("settings_get", (_event, params) =>
			this.settings.get(params?.key),
		);
		ipc.handle("settings_set", (_event, params) => {
			this.settings.set(params?.key, params?.value);
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
			const level = params?.level ?? "info";
			const message = params?.message ?? "";
			// eslint-disable-next-line no-console
			console[level] ? console[level](message) : console.log(message);
		});
	}
}
