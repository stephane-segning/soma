import { Container } from "inversify";
import { TYPES } from "./types";
import { AppDataStore } from "./services/app-data-store";
import { DaemonClient } from "./services/daemon-client";
import { AgentClient } from "./services/agent-client";
import { BlobProtocolRegistrar } from "./services/blob-protocol";
import { CommandRegistry } from "./command-registry";
import { BlobsController } from "./controllers/blobs-controller";
import { DocumentsController } from "./controllers/documents-controller";
import { SpacesController } from "./controllers/spaces-controller";
import { AgentController } from "./controllers/agent-controller";
import { SearchController } from "./controllers/search-controller";
import { SettingsController } from "./controllers/settings-controller";
import { WindowController } from "./controllers/window-controller";

export function buildContainer(): Container {
	const container = new Container({ defaultScope: "Singleton" });

	container
		.bind<AppDataStore>(TYPES.AppDataStore)
		.toConstantValue(new AppDataStore());
	container
		.bind<DaemonClient>(TYPES.DaemonClient)
		.toDynamicValue(
			(ctx) => new DaemonClient(ctx.container.get(TYPES.AppDataStore)),
		);
	container
		.bind<AgentClient>(TYPES.AgentClient)
		.toDynamicValue(() => new AgentClient());

	container
		.bind<BlobProtocolRegistrar>(TYPES.BlobProtocol)
		.toDynamicValue(
			(ctx) =>
				new BlobProtocolRegistrar(
					ctx.container.get(TYPES.AppDataStore),
					ctx.container.get(TYPES.DaemonClient),
				),
		);

	container
		.bind<BlobsController>(TYPES.BlobsController)
		.toDynamicValue(
			(ctx) => new BlobsController(ctx.container.get(TYPES.DaemonClient)),
		);
	container
		.bind<DocumentsController>(TYPES.DocumentsController)
		.toDynamicValue(
			(ctx) => new DocumentsController(ctx.container.get(TYPES.DaemonClient)),
		);
	container
		.bind<SpacesController>(TYPES.SpacesController)
		.toDynamicValue(
			(ctx) => new SpacesController(ctx.container.get(TYPES.DaemonClient)),
		);
	container
		.bind<AgentController>(TYPES.AgentController)
		.toDynamicValue(
			(ctx) => new AgentController(ctx.container.get(TYPES.AgentClient)),
		);
	container
		.bind<SearchController>(TYPES.SearchController)
		.toDynamicValue(
			(ctx) => new SearchController(ctx.container.get(TYPES.DaemonClient)),
		);
	container
		.bind<SettingsController>(TYPES.SettingsController)
		.toDynamicValue(
			(ctx) => new SettingsController(ctx.container.get(TYPES.AppDataStore)),
		);
	container
		.bind<WindowController>(TYPES.WindowController)
		.toDynamicValue(() => new WindowController());

	container
		.bind<CommandRegistry>(TYPES.CommandRegistry)
		.toDynamicValue(
			(ctx) =>
				new CommandRegistry(
					ctx.container.get(TYPES.BlobsController),
					ctx.container.get(TYPES.DocumentsController),
					ctx.container.get(TYPES.SpacesController),
					ctx.container.get(TYPES.AgentController),
					ctx.container.get(TYPES.SearchController),
					ctx.container.get(TYPES.SettingsController),
					ctx.container.get(TYPES.WindowController),
				),
		);

	return container;
}
