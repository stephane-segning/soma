import "reflect-metadata";
import { is } from "@electron-toolkit/utils";
import { app } from "electron";
import { join } from "path";
import { buildContainer } from "./container";
import type { StartupService } from "./services/startup-service";
import { TYPES } from "./types";

const container = buildContainer({
	logDir: join(app.getPath("userData"), "logs"),
	isDev: is.dev,
});

const startup = container.get<StartupService>(TYPES.StartupService);
startup.run();
