import type { IpcMain } from "electron";
import { registerAgentHandlers } from "./command-registry/agent-handlers";
import { registerBlobHandlers } from "./command-registry/blob-handlers";
import { registerDaemonHandlers } from "./command-registry/daemon-handlers";
import { registerDocumentHandlers } from "./command-registry/document-handlers";
import { registerPracticeHandlers } from "./command-registry/practice-handlers";
import { registerSettingsStorageHandlers } from "./command-registry/settings-storage-handlers";
import { registerSpaceHandlers } from "./command-registry/space-handlers";
import type { CommandRegistryContext } from "./command-registry/types";
import { registerWindowLogHandlers } from "./command-registry/window-log-handlers";
import type { AgentController } from "./controllers/agent-controller";
import type { BlobsController } from "./controllers/blobs-controller";
import type { DbStorageController } from "./controllers/db-storage-controller";
import type { DocumentsController } from "./controllers/documents-controller";
import type { PracticeController } from "./controllers/practice-controller";
import type { SearchController } from "./controllers/search-controller";
import type { SettingsController } from "./controllers/settings-controller";
import type { SpacesController } from "./controllers/spaces-controller";
import type { WindowController } from "./controllers/window-controller";
import type { DaemonProcessManager } from "./services/daemon-process-manager";
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
		practice: PracticeController,
		domainEvents: DomainEventsService,
		windows: WindowController,
		daemonProcess: DaemonProcessManager,
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
			practice,
			domainEvents,
			windows,
			daemonProcess,
			logger,
		};
	}

	register(ipc: IpcMain): void {
		registerBlobHandlers(ipc, this.context);
		registerDocumentHandlers(ipc, this.context);
		registerAgentHandlers(ipc, this.context);
		registerSpaceHandlers(ipc, this.context);
		registerDaemonHandlers(ipc, this.context);
		registerSettingsStorageHandlers(ipc, this.context);
		registerPracticeHandlers(ipc, this.context);
		registerWindowLogHandlers(ipc, this.context);
	}
}
