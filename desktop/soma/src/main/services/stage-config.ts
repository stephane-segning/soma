import { app } from "electron";
import { join } from "node:path";

export class StageConfigService {
	private readonly isDev: boolean;

	constructor(isDev: boolean) {
		this.isDev = isDev;
	}

	apply(): void {
		const appName = app.getName();
		const stageFromName = appName.toLowerCase().startsWith("soma-")
			? appName.slice("soma-".length)
			: null;
		const allowEnvOverride = !app.isPackaged;
		const rawStage = allowEnvOverride
			? process.env.SOMA_STAGE ||
				process.env.SOMA_CHANNEL ||
				stageFromName ||
				(this.isDev ? "dev" : "prod")
			: stageFromName || "prod";
		const normalizedStage =
			rawStage.trim().toLowerCase() === "production"
				? "prod"
				: rawStage.trim().toLowerCase();

		if (normalizedStage === "prod") {
			return;
		}

		const stageRoot = join(app.getPath("appData"), `soma-${normalizedStage}`);
		app.setPath("appData", stageRoot);
		app.setPath("userData", join(stageRoot, "user-data"));
		app.setPath("sessionData", join(stageRoot, "session"));
		app.setPath("logs", join(stageRoot, "logs"));
		app.setPath("crashDumps", join(stageRoot, "crashes"));
		app.setPath("cache", join(stageRoot, "cache"));
		app.setName(`soma-${normalizedStage}`);
	}
}
