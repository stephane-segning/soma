import { Container } from "inversify";
import { SomaElectronApp } from "./app";
import { AppStateSyncService } from "./services/app-state-sync-service";
import { AppSettingsService } from "./services/app-settings-service";
import { DaemonClient } from "./services/daemon-client";
import { DbService } from "./services/db-service";
import { DocumentsService } from "./services/documents-service";
import { IpcService } from "./services/ipc-service";
import { MainBootstrapService } from "./services/main-bootstrap-service";
import { MainIpcController } from "./services/main-ipc-controller";
import { MainWindowController } from "./services/main-window-controller";
import { WindowManager } from "./services/window-manager";
import { TYPES, type Token } from "./tokens";

const container = new Container({ defaultScope: "Singleton" });

container
	.bind<AppStateSyncService>(TYPES.appStateSyncService)
	.to(AppStateSyncService);
container
	.bind<AppSettingsService>(TYPES.appSettingsService)
	.to(AppSettingsService);
container.bind<DbService>(TYPES.dbService).to(DbService);
container.bind<DocumentsService>(TYPES.documentsService).to(DocumentsService);
container.bind<DaemonClient>(TYPES.daemonClient).to(DaemonClient);
container.bind<IpcService>(TYPES.ipcService).to(IpcService);
container
	.bind<MainIpcController>(TYPES.mainIpcController)
	.to(MainIpcController);
container
	.bind<MainBootstrapService>(TYPES.mainBootstrapService)
	.to(MainBootstrapService);
container
	.bind<MainWindowController>(TYPES.mainWindowController)
	.to(MainWindowController);
container.bind<WindowManager>(TYPES.windowManager).to(WindowManager);
container.bind<SomaElectronApp>(TYPES.somaElectronApp).to(SomaElectronApp);

function resolve(identifier: typeof TYPES.daemonClient): DaemonClient;
function resolve(
	identifier: typeof TYPES.appStateSyncService,
): AppStateSyncService;
function resolve(
	identifier: typeof TYPES.appSettingsService,
): AppSettingsService;
function resolve(identifier: typeof TYPES.dbService): DbService;
function resolve(identifier: typeof TYPES.documentsService): DocumentsService;
function resolve(identifier: typeof TYPES.ipcService): IpcService;
function resolve(identifier: typeof TYPES.mainIpcController): MainIpcController;
function resolve(
	identifier: typeof TYPES.mainBootstrapService,
): MainBootstrapService;
function resolve(
	identifier: typeof TYPES.mainWindowController,
): MainWindowController;
function resolve(identifier: typeof TYPES.windowManager): WindowManager;
function resolve(identifier: typeof TYPES.somaElectronApp): SomaElectronApp;
function resolve(identifier: Token) {
	return container.get(identifier as never);
}

export { container, resolve };
export { TYPES };
