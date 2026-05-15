import { is } from "@electron-toolkit/utils";
import { StageConfigService } from "@soma/desktop-config";

export const runtimeConfig = new StageConfigService({
	appPrefix: "tapia",
	isDev: is.dev,
	stageEnvKeys: ["TAPIA_STAGE", "SOMA_STAGE", "SOMA_CHANNEL"],
	daemonSocketEnvKey: "SOMA_DAEMON_SOCKET",
	daemonSocketBaseName: "soma-daemon",
}).apply();
