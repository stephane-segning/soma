import type { AgentController } from "../controllers/agent-controller";
import type { BlobsController } from "../controllers/blobs-controller";
import type { DbStorageController } from "../controllers/db-storage-controller";
import type { DocumentsController } from "../controllers/documents-controller";
import type { PracticeController } from "../controllers/practice-controller";
import type { SearchController } from "../controllers/search-controller";
import type { SettingsController } from "../controllers/settings-controller";
import type { SpacesController } from "../controllers/spaces-controller";
import type { WindowController } from "../controllers/window-controller";
import type { DaemonProcessManager } from "../services/daemon-process-manager";
import type { DomainEventsService } from "../services/domain-events";
import type { AppLogger } from "../services/logger";

export type CommandRegistryContext = {
	blobs: BlobsController;
	documents: DocumentsController;
	spaces: SpacesController;
	agent: AgentController;
	search: SearchController;
	settings: SettingsController;
	dbStorage: DbStorageController;
	practice: PracticeController;
	domainEvents: DomainEventsService;
	windows: WindowController;
	daemonProcess: DaemonProcessManager;
	logger: AppLogger;
};
