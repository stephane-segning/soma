import { join } from "node:path";
import { app } from "electron";

export type SomaRuntimeConfig = {
	stage: string;
	daemonSocketPath: string;
	agentSocketPath: string;
};

export class StageConfigService {
	private readonly isDev: boolean;

	constructor(isDev: boolean) {
		this.isDev = isDev;
	}

	apply(): SomaRuntimeConfig {
		const appName = app.getName();
		const stageFromName = appName.toLowerCase().startsWith("soma-") ? appName.slice("soma-".length) : null;
		const allowEnvOverride = !app.isPackaged;
		const rawStage = allowEnvOverride
			? process.env.SOMA_STAGE || process.env.SOMA_CHANNEL || stageFromName || (this.isDev ? "dev" : "prod")
			: stageFromName || "prod";
		const normalizedStage = rawStage.trim().toLowerCase() === "production" ? "prod" : rawStage.trim().toLowerCase();

		if (normalizedStage === "prod") {
			const prodDaemonSocket = (allowEnvOverride && process.env.SOMA_DAEMON_SOCKET) || "/tmp/soma-daemon.sock";
			const prodAgentSocket = (allowEnvOverride && process.env.SOMA_AGENTD_SOCKET) || "/tmp/soma-agentd.sock";
			return {
				stage: "prod",
				daemonSocketPath: prodDaemonSocket,
				agentSocketPath: prodAgentSocket,
			};
		}

		const stageRoot = join(app.getPath("appData"), `soma-${normalizedStage}`);
		app.setPath("appData", stageRoot);
		app.setPath("userData", join(stageRoot, "user-data"));
		app.setPath("sessionData", join(stageRoot, "session"));
		app.setPath("logs", join(stageRoot, "logs"));
		app.setPath("crashDumps", join(stageRoot, "crashes"));
		app.setPath("cache", join(stageRoot, "cache"));
		app.setName(`soma-${normalizedStage}`);

		const defaultDaemonSocket = `/tmp/soma-daemon-${normalizedStage}.sock`;
		const defaultAgentSocket = `/tmp/soma-agentd-${normalizedStage}.sock`;

		return {
			stage: normalizedStage,
			daemonSocketPath: (allowEnvOverride && process.env.SOMA_DAEMON_SOCKET) || defaultDaemonSocket,
			agentSocketPath: (allowEnvOverride && process.env.SOMA_AGENTD_SOCKET) || defaultAgentSocket,
		};
	}
}
