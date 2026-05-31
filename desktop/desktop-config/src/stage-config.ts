import { homedir } from "node:os";
import { join } from "node:path";

export type Stage = "dev" | "staging" | "prod";

export type StageConfigOptions = {
	/**
	 * macOS / Windows folder name and the base used to derive every other
	 * platform's directory name. Defaults to "Soma".
	 */
	appName?: string;
	/**
	 * Linux / XDG directory name (lower-case by convention). Defaults to
	 * `appName.toLowerCase()`, e.g. "soma".
	 */
	unixAppName?: string;
	/** Name of the single database file. Defaults to "soma.db". */
	databaseFileName?: string;
	/** When nothing else resolves a stage, fall back to "dev" instead of "prod". */
	isDev?: boolean;
	/** Environment variables checked, in order, for an explicit stage override. */
	stageEnvKeys?: string[];
	/**
	 * Packaged product/app name to derive the stage from when no env override is
	 * present, e.g. "Soma-staging" → "staging". Optional.
	 */
	appNameForStage?: string;
	/** Override the platform. Defaults to `process.platform`. */
	platform?: NodeJS.Platform;
	/** Override the home directory. Defaults to `os.homedir()`. */
	homeDir?: string;
	/** Override the environment. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv;
};

export type StageRuntimeConfig = {
	stage: Stage;
	/** Root data directory for this stage. */
	dataDir: string;
	/** Absolute path to the single SQLite database file. */
	databasePath: string;
	/** Logs directory (under the stage data root). */
	logsDir: string;
	/** Cache directory (under the stage data root). */
	cacheDir: string;
};

const DEFAULT_APP_NAME = "Soma";
const DEFAULT_DATABASE_FILE = "soma.db";
const DEFAULT_STAGE_ENV_KEYS = ["SOMA_STAGE", "SOMA_CHANNEL"];

export class StageConfigService {
	private readonly options: StageConfigOptions;

	constructor(options: StageConfigOptions = {}) {
		this.options = options;
	}

	resolve(): StageRuntimeConfig {
		const appName = (this.options.appName ?? DEFAULT_APP_NAME).trim();
		const unixAppName = (
			this.options.unixAppName ?? appName.toLowerCase()
		).trim();
		const databaseFileName =
			this.options.databaseFileName ?? DEFAULT_DATABASE_FILE;
		const platform = this.options.platform ?? process.platform;
		const home = this.options.homeDir ?? homedir();
		const env = this.options.env ?? process.env;

		const stage = this.resolveStage(appName, env);

		const dataDir = this.dataDir({
			stage,
			platform,
			home,
			appName,
			unixAppName,
			env,
		});

		return {
			stage,
			dataDir,
			databasePath: join(dataDir, databaseFileName),
			logsDir: join(dataDir, "logs"),
			cacheDir: join(dataDir, "cache"),
		};
	}

	private resolveStage(appName: string, env: NodeJS.ProcessEnv): Stage {
		const stageEnvKeys = this.options.stageEnvKeys ?? DEFAULT_STAGE_ENV_KEYS;
		const envStage = this.readEnv(stageEnvKeys, env);
		if (envStage) {
			return normalizeStage(envStage);
		}

		const fromName = this.stageFromAppName(
			this.options.appNameForStage,
			appName,
		);
		if (fromName) {
			return normalizeStage(fromName);
		}

		return this.options.isDev ? "dev" : "prod";
	}

	private stageFromAppName(
		appNameForStage: string | undefined,
		appName: string,
	): string | null {
		if (!appNameForStage) {
			return null;
		}
		const lowered = appNameForStage.trim().toLowerCase();
		const prefix = `${appName.toLowerCase()}-`;
		if (lowered.startsWith(prefix)) {
			return lowered.slice(prefix.length);
		}
		return null;
	}

	private readEnv(keys: string[], env: NodeJS.ProcessEnv): string | null {
		for (const key of keys) {
			const value = env[key];
			if (value && value.trim().length > 0) {
				return value;
			}
		}
		return null;
	}

	private dataDir(args: {
		stage: Stage;
		platform: NodeJS.Platform;
		home: string;
		appName: string;
		unixAppName: string;
		env: NodeJS.ProcessEnv;
	}): string {
		const { stage, platform, home, appName, unixAppName, env } = args;
		const suffix = stage === "prod" ? "" : `-${stage}`;

		if (platform === "darwin") {
			return join(
				home,
				"Library",
				"Application Support",
				`${appName}${suffix}`,
			);
		}

		if (platform === "win32") {
			const base = env.APPDATA?.trim() || join(home, "AppData", "Roaming");
			return join(base, `${appName}${suffix}`);
		}

		// Linux + other Unix-likes follow the XDG base-directory spec.
		const xdgDataHome = env.XDG_DATA_HOME?.trim();
		const base = xdgDataHome || join(home, ".local", "share");
		return join(base, `${unixAppName}${suffix}`);
	}
}

export function resolveStageConfig(
	options: StageConfigOptions = {},
): StageRuntimeConfig {
	return new StageConfigService(options).resolve();
}

export function normalizeStage(rawStage: string): Stage {
	const normalized = rawStage.trim().toLowerCase();
	switch (normalized) {
		case "dev":
		case "development":
		case "debug":
			return "dev";
		case "staging":
		case "stage":
		case "beta":
		case "canary":
			return "staging";
		default:
			return "prod";
	}
}
