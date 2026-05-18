export const TYPES = {
	AppDataStore: Symbol("AppDataStore"),
	AddonRuntime: Symbol("AddonRuntime"),
	DaemonClient: Symbol("DaemonClient"),
	AgentClient: Symbol("AgentClient"),
	AgentEvents: Symbol("AgentEvents"),
	BlobProtocol: Symbol("BlobProtocol"),
	CommandRegistry: Symbol("CommandRegistry"),
	BlobsController: Symbol("BlobsController"),
	DocumentsController: Symbol("DocumentsController"),
	SpacesController: Symbol("SpacesController"),
	AgentController: Symbol("AgentController"),
	SearchController: Symbol("SearchController"),
	SettingsController: Symbol("SettingsController"),
	DbStorageController: Symbol("DbStorageController"),
	PracticeController: Symbol("PracticeController"),
	UploadPayloadStore: Symbol("UploadPayloadStore"),
	DomainEvents: Symbol("DomainEvents"),
	WindowController: Symbol("WindowController"),
	Logger: Symbol("Logger"),
	StartupService: Symbol("StartupService"),
} as const;

export type TypeKey = (typeof TYPES)[keyof typeof TYPES];
