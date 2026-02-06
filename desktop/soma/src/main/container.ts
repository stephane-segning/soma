import type { StageRuntimeConfig } from "@soma/desktop-config";
import { app } from "electron";
import { Container } from "inversify";
import { join } from "node:path";
import { CommandRegistry } from "./command-registry";
import { AgentController } from "./controllers/agent-controller";
import { BlobsController } from "./controllers/blobs-controller";
import { DbStorageController } from "./controllers/db-storage-controller";
import { DocumentsController } from "./controllers/documents-controller";
import { SearchController } from "./controllers/search-controller";
import { SettingsController } from "./controllers/settings-controller";
import { SpacesController } from "./controllers/spaces-controller";
import { WindowController } from "./controllers/window-controller";
import { AgentClient } from "./services/agent-client";
import { AGENT_CONFIG_SETTINGS_KEY } from "./services/agent-config";
import { AgentEventsService } from "./services/agent-events";
import { AppDataStore } from "./services/app-data-store";
import { BlobProtocolRegistrar } from "./services/blob-protocol";
import { DaemonClient } from "./services/daemon-client";
import { DomainEventsService } from "./services/domain-events";
import { AppLogger } from "./services/logger";
import { StartupService } from "./services/startup-service";
import { UploadPayloadStore } from "./services/upload-payload-store";
import { TYPES } from "./types";

export type ContainerOptions = {
	logDir: string;
	isDev: boolean;
	runtimeConfig: StageRuntimeConfig;
};

export function buildContainer(options: ContainerOptions): Container {
	const container = new Container({
		defaultScope: "Singleton",
	});

	container.bind<AppDataStore>(TYPES.AppDataStore).toConstantValue(new AppDataStore());
	container
		.bind<DaemonClient>(TYPES.DaemonClient)
		.toDynamicValue(() => new DaemonClient(options.runtimeConfig.daemonSocketPath));
	container
		.bind<AgentClient>(TYPES.AgentClient)
		.toDynamicValue(
			(ctx) =>
				new AgentClient(options.runtimeConfig.agentSocketPath, () => {
					const store = ctx.get<AppDataStore>(TYPES.AppDataStore);
					return store.settings[AGENT_CONFIG_SETTINGS_KEY];
				}),
		);

	container.bind<AppLogger>(TYPES.Logger).toConstantValue(new AppLogger(options));
	container.bind<AgentEventsService>(TYPES.AgentEvents).toConstantValue(new AgentEventsService());
	container.bind<DomainEventsService>(TYPES.DomainEvents).toConstantValue(new DomainEventsService());

	container
		.bind<BlobProtocolRegistrar>(TYPES.BlobProtocol)
		.toDynamicValue((ctx) => new BlobProtocolRegistrar(ctx.get(TYPES.DaemonClient)));
	container
		.bind<UploadPayloadStore>(TYPES.UploadPayloadStore)
		.toConstantValue(new UploadPayloadStore(join(app.getPath("userData"), "tmp", "uploads")));

	container
		.bind<BlobsController>(TYPES.BlobsController)
		.toDynamicValue(
			(ctx) =>
				new BlobsController(
					ctx.get(TYPES.DaemonClient),
					ctx.get(TYPES.UploadPayloadStore),
				),
		);
	container
		.bind<DocumentsController>(TYPES.DocumentsController)
		.toDynamicValue((ctx) => new DocumentsController(ctx.get(TYPES.DaemonClient)));
	container
		.bind<SpacesController>(TYPES.SpacesController)
		.toDynamicValue((ctx) => new SpacesController(ctx.get(TYPES.DaemonClient)));
	container
		.bind<AgentController>(TYPES.AgentController)
		.toDynamicValue((ctx) => new AgentController(ctx.get(TYPES.AgentClient)));
	container
		.bind<SearchController>(TYPES.SearchController)
		.toDynamicValue((ctx) => new SearchController(ctx.get(TYPES.DaemonClient)));
	container
		.bind<SettingsController>(TYPES.SettingsController)
		.toDynamicValue((ctx) => new SettingsController(ctx.get(TYPES.AppDataStore)));
	container
		.bind<DbStorageController>(TYPES.DbStorageController)
		.toDynamicValue((ctx) => new DbStorageController(ctx.get(TYPES.AppDataStore)));
	container.bind<WindowController>(TYPES.WindowController).toDynamicValue(() => new WindowController());

	container
		.bind<CommandRegistry>(TYPES.CommandRegistry)
		.toDynamicValue(
			(ctx) =>
				new CommandRegistry(
					ctx.get(TYPES.BlobsController),
					ctx.get(TYPES.DocumentsController),
					ctx.get(TYPES.SpacesController),
					ctx.get(TYPES.AgentController),
					ctx.get(TYPES.SearchController),
					ctx.get(TYPES.SettingsController),
					ctx.get(TYPES.DbStorageController),
					ctx.get(TYPES.DomainEvents),
					ctx.get(TYPES.WindowController),
					ctx.get(TYPES.Logger),
				),
		);

	container
		.bind<StartupService>(TYPES.StartupService)
		.toDynamicValue(
			(ctx) =>
				new StartupService(
					ctx.get(TYPES.AppDataStore),
					ctx.get(TYPES.Logger),
					ctx.get(TYPES.BlobProtocol),
					ctx.get(TYPES.CommandRegistry),
					ctx.get(TYPES.DaemonClient),
					ctx.get(TYPES.AgentClient),
					ctx.get(TYPES.AgentEvents),
					ctx.get(TYPES.DomainEvents),
				),
		);

	return container;
}
