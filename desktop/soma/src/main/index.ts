import "reflect-metadata";
import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import { app } from "electron";
import { buildContainer } from "./container";
import { StageConfigService } from "./services/stage-config";
import type { StartupService } from "./services/startup-service";
import { TYPES } from "./types";

const runtimeConfig = new StageConfigService(is.dev).apply();

const container = buildContainer({
	logDir: join(app.getPath("userData"), "logs"),
	isDev: is.dev,
	runtimeConfig,
});

const startup = container.get<StartupService>(TYPES.StartupService);
startup.run();
