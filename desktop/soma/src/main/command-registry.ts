import type { IpcMain } from "electron";
import type { AgentController } from "./controllers/agent-controller";
import type { BlobsController } from "./controllers/blobs-controller";
import type { DbStorageController } from "./controllers/db-storage-controller";
import type { DocumentsController } from "./controllers/documents-controller";
import type { SearchController } from "./controllers/search-controller";
import type { SettingsController } from "./controllers/settings-controller";
import type { SpacesController } from "./controllers/spaces-controller";
import type { WindowController } from "./controllers/window-controller";
import { registerAgentHandlers } from "./command-registry/agent-handlers";
import { registerBlobHandlers } from "./command-registry/blob-handlers";
import { registerDocumentHandlers } from "./command-registry/document-handlers";
import { registerSettingsStorageHandlers } from "./command-registry/settings-storage-handlers";
import { registerSpaceHandlers } from "./command-registry/space-handlers";
import { registerWindowLogHandlers } from "./command-registry/window-log-handlers";
import type { CommandRegistryContext } from "./command-registry/types";
import type { DomainEventsService } from "./services/domain-events";
import type { AppLogger } from "./services/logger";

export class CommandRegistry {
	private readonly context: CommandRegistryContext;

	constructor(
		blobs: BlobsController,
		documents: DocumentsController,
		spaces: SpacesController,
		agent: AgentController,
		search: SearchController,
		settings: SettingsController,
		dbStorage: DbStorageController,
		domainEvents: DomainEventsService,
		windows: WindowController,
		logger: AppLogger,
	) {
		this.context = {
			blobs,
			documents,
			spaces,
			agent,
			search,
			settings,
			dbStorage,
			domainEvents,
			windows,
			logger,
		};
	}

	register(ipc: IpcMain): void {
		registerBlobHandlers(ipc, this.context);
		registerDocumentHandlers(ipc, this.context);
		registerAgentHandlers(ipc, this.context);
		registerSpaceHandlers(ipc, this.context);
		registerSettingsStorageHandlers(ipc, this.context);
		registerWindowLogHandlers(ipc, this.context);
	}
}
