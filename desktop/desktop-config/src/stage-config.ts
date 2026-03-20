import { app } from "electron";
import { join } from "node:path";

export type StageConfigOptions = {
	appPrefix: string;
	isDev: boolean;
	stageEnvKeys?: string[];
	daemonSocketEnvKey?: string;
	agentSocketEnvKey?: string;
	daemonSocketBaseName?: string;
	agentSocketBaseName?: string;
	socketDir?: string;
	allowEnvOverrideInPackaged?: boolean;
};

export type StageRuntimeConfig = {
	stage: string;
	daemonSocketPath: string;
	agentSocketPath: string;
};

export class StageConfigService {
	private readonly options: StageConfigOptions;

	constructor(options: StageConfigOptions) {
		this.options = options;
	}

	apply(): StageRuntimeConfig {
		const appPrefix = this.options.appPrefix.trim();
		const allowEnvOverride = app.isPackaged
			? this.options.allowEnvOverrideInPackaged === true
			: true;
		const stageEnvKeys = this.options.stageEnvKeys ?? ["SOMA_STAGE", "SOMA_CHANNEL"];
		const appName = app.getName();
		const stageFromName = this.stageFromAppName(appName, appPrefix);
		const envStage = allowEnvOverride ? this.readEnv(stageEnvKeys) : null;
		const rawStage = envStage || stageFromName || (this.options.isDev ? "dev" : "prod");
		const stage = this.normalizeStage(rawStage);

		if (stage !== "prod") {
			const stageRoot = join(app.getPath("appData"), `${appPrefix}-${stage}`);
			app.setPath("appData", stageRoot);
			app.setPath("userData", join(stageRoot, "user-data"));
			app.setPath("sessionData", join(stageRoot, "session"));
			app.setPath("logs", join(stageRoot, "logs"));
			app.setPath("crashDumps", join(stageRoot, "crashes"));
			app.setPath("cache", join(stageRoot, "cache"));
			app.setName(`${appPrefix}-${stage}`);
		}

		const socketDir = this.options.socketDir ?? "/tmp";
		const daemonSocketBaseName = this.options.daemonSocketBaseName ?? `${appPrefix}-daemon`;
		const agentSocketBaseName = this.options.agentSocketBaseName ?? `${appPrefix}-agentd`;
		const daemonSocketPath = this.resolveSocketPath({
			stage,
			socketDir,
			envKey: this.options.daemonSocketEnvKey,
			baseName: daemonSocketBaseName,
			allowEnvOverride,
		});
		const agentSocketPath = this.resolveSocketPath({
			stage,
			socketDir,
			envKey: this.options.agentSocketEnvKey,
			baseName: agentSocketBaseName,
			allowEnvOverride,
		});

		return {
			stage,
			daemonSocketPath,
			agentSocketPath,
		};
	}

	private stageFromAppName(appName: string, appPrefix: string): string | null {
		const loweredName = appName.toLowerCase();
		const loweredPrefix = appPrefix.toLowerCase();
		const prefixWithDash = `${loweredPrefix}-`;
		if (loweredName.startsWith(prefixWithDash)) {
			return loweredName.slice(prefixWithDash.length);
		}
		return null;
	}

	private normalizeStage(rawStage: string): string {
		const normalized = rawStage.trim().toLowerCase();
		return normalized === "production" ? "prod" : normalized;
	}

	private readEnv(keys: string[]): string | null {
		for (const key of keys) {
			const value = process.env[key];
			if (value && value.trim().length > 0) {
				return value;
			}
		}
		return null;
	}

	private resolveSocketPath(options: {
		stage: string;
		socketDir: string;
		envKey?: string;
		baseName: string;
		allowEnvOverride: boolean;
	}): string {
		const envValue =
			options.allowEnvOverride && options.envKey
				? process.env[options.envKey]
				: undefined;
		if (envValue && envValue.trim().length > 0) {
			return envValue;
		}
		const suffix = options.stage === "prod" ? "" : `-${options.stage}`;
		return join(options.socketDir, `${options.baseName}${suffix}.sock`);
	}
}
