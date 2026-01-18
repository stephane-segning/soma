import "reflect-metadata";
import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import { StageConfigService } from "@soma/desktop-config";
import { app } from "electron";
import { buildContainer } from "./container";
import type { StartupService } from "./services/startup-service";
import { TYPES } from "./types";

const runtimeConfig = new StageConfigService({
	appPrefix: "soma",
	isDev: is.dev,
	stageEnvKeys: ["SOMA_STAGE", "SOMA_CHANNEL"],
	daemonSocketEnvKey: "SOMA_DAEMON_SOCKET",
	agentSocketEnvKey: "SOMA_AGENTD_SOCKET",
	daemonSocketBaseName: "soma-daemon",
	agentSocketBaseName: "soma-agentd",
}).apply();

const container = buildContainer({
	logDir: join(app.getPath("userData"), "logs"),
	isDev: is.dev,
	runtimeConfig,
});

const startup = container.get<StartupService>(TYPES.StartupService);
startup.run();
