import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { StageRuntimeConfig } from "@soma/desktop-config";
import { type SomaHandle, type StartConfig, start } from "@soma/node";

import type { AppLogger } from "./logger";

export type AddonRuntimeOptions = {
	/** Electron `app.getPath('userData')`. */
	userDataDir: string;
	/** Electron `app.getPath('logs')` — currently unused by the addon, kept for symmetry. */
	logsDir?: string;
	/** Resolved stage runtime config from `@soma/desktop-config` (socket fields ignored). */
	stage?: StageRuntimeConfig;
	/** Overrides for the addon's `StartConfig`. Useful for tests / env overrides. */
	overrides?: Partial<StartConfig>;
};

/**
 * Owns the lifecycle of the in-process Soma peer + agent runtimes via the
 * `@soma/node` napi addon. There is at most one `SomaHandle` per Electron
 * process.
 */
export class AddonRuntime {
	private handle: SomaHandle | null = null;
	private startPromise: Promise<SomaHandle> | null = null;

	constructor(
		private readonly options: AddonRuntimeOptions,
		private readonly logger: AppLogger,
	) {}

	/** Idempotent: subsequent calls return the same handle (or wait for it). */
	async start(): Promise<SomaHandle> {
		if (this.handle) return this.handle;
		if (this.startPromise) return this.startPromise;

		const config = await this.buildConfig();
		this.logger.log("info", "starting @soma/node addon runtime", {
			daemonDbPath: config.daemonDbPath,
			agentdDbPath: config.agentdDbPath,
			blobDir: config.blobDir,
			listenAddrs: config.listenAddrs,
		});

		this.startPromise = start(config)
			.then((handle) => {
				this.handle = handle;
				this.startPromise = null;
				this.logger.log("info", "@soma/node addon runtime started");
				return handle;
			})
			.catch((error) => {
				this.startPromise = null;
				this.logger.log("error", "@soma/node addon runtime failed to start", {
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			});
		return this.startPromise;
	}

	/** Throws if the runtime has not been started yet. */
	getHandle(): SomaHandle {
		if (!this.handle) {
			throw new Error("AddonRuntime has not been started");
		}
		return this.handle;
	}

	isStarted(): boolean {
		return this.handle !== null;
	}

	async shutdown(): Promise<void> {
		const handle = this.handle;
		this.handle = null;
		if (!handle) return;
		try {
			await handle.shutdown();
			this.logger.log("info", "@soma/node addon runtime shut down");
		} catch (error) {
			this.logger.log("warn", "error during addon runtime shutdown", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async buildConfig(): Promise<StartConfig> {
		const dataDir = join(this.options.userDataDir, "daemon");
		const daemonDbPath = join(dataDir, "daemon.db");
		const agentdDbPath = join(dataDir, "agentd.db");
		const blobDir = join(dataDir, "blobs");
		// Pin the libp2p identity inside userData so packaged launches don't
		// fall back to `data/daemon/identity.key` relative to Electron's cwd
		// (which is `/` for Finder launches, EACCES) and don't silently rotate
		// the peer identity between launch contexts. The removed LaunchAgent
		// path used to set SOMA_DATA_DIR for the same purpose.
		const identityPath = join(dataDir, "identity.key");

		// `mkdir … { recursive: true }` on the deepest directory creates every
		// parent on the way, so one call is enough.
		await mkdir(blobDir, { recursive: true });

		const base: StartConfig = {
			daemonDbPath,
			agentdDbPath,
			blobDir,
			identityPath,
			listenAddrs: ["/ip4/0.0.0.0/tcp/0/ws"],
			enableMdns: true,
		};
		return {
			...base,
			...this.options.overrides,
		};
	}
}
