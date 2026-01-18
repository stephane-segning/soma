import "reflect-metadata";
import { is } from "@electron-toolkit/utils";
import { app } from "electron";
import { join } from "node:path";
import { buildContainer } from "./container";
import type { StartupService } from "./services/startup-service";
import { StageConfigService } from "./services/stage-config";
import { TYPES } from "./types";

new StageConfigService(is.dev).apply();

const container = buildContainer({
	logDir: join(app.getPath("userData"), "logs"),
	isDev: is.dev,
});

const startup = container.get<StartupService>(TYPES.StartupService);
startup.run();
