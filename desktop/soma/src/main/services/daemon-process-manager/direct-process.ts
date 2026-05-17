import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { StageRuntimeConfig } from "@soma/desktop-config";
import { app } from "electron";
import type { AppLogger } from "../logger";
import type { DaemonBinary } from "./types";

export class DirectDaemonProcess {
	private child: ChildProcessWithoutNullStreams | null = null;

	constructor(
		private readonly runtimeConfig: StageRuntimeConfig,
		private readonly logger: AppLogger,
		private readonly isDev: boolean,
	) {}

	async start(): Promise<void> {
		if (this.child && !this.child.killed) return;
		const binary = this.findDaemonBinary();
		if (!binary) {
			this.logger.log("warn", "no soma-daemon binary found for direct launch");
			return;
		}

		const dataDir = join(app.getPath("userData"), "daemon");
		await mkdir(dataDir, { recursive: true });
		this.child = spawn(binary.command, [...binary.prefixArgs, ...this.daemonArgs(dataDir)], {
			cwd: binary.cwd,
			env: {
				...process.env,
				SOMA_LOGS_DIR: join(app.getPath("logs"), "daemon"),
			},
			stdio: "pipe",
		});
		this.attachListeners();
	}

	stop(): void {
		if (!this.child || this.child.killed) return;
		this.child.kill("SIGTERM");
		this.child = null;
	}

	private daemonArgs(dataDir: string): string[] {
		return [
			"--socket-path",
			this.runtimeConfig.daemonSocketPath,
			"--db-path",
			join(dataDir, "daemon.db"),
			"--blob-dir",
			join(dataDir, "blobs"),
			"--listen-addrs",
			"/ip4/0.0.0.0/tcp/0/ws",
		];
	}

	private attachListeners(): void {
		if (!this.child) return;
		this.child.on("exit", (code, signal) => {
			this.logger.log("info", "direct soma-daemon process exited", { code, signal });
			this.child = null;
		});
		this.child.stderr.on("data", (chunk) => {
			this.logger.log("warn", "soma-daemon stderr", { message: chunk.toString() });
		});
	}

	private findDaemonBinary(): DaemonBinary | null {
		const envPath = process.env.SOMA_DAEMON_BIN?.trim();
		if (envPath) return { command: envPath, prefixArgs: [] };

		for (const candidate of this.binaryCandidates()) {
			if (existsSync(candidate)) return { command: candidate, prefixArgs: [] };
		}

		if (this.isDev && existsSync(resolve(process.cwd(), "Cargo.toml"))) {
			return {
				command: "cargo",
				prefixArgs: ["run", "-p", "soma-daemon", "--"],
				cwd: process.cwd(),
			};
		}

		const homeBinary = join(homedir(), ".local", "bin", "soma-daemon");
		if (existsSync(homeBinary)) return { command: homeBinary, prefixArgs: [] };
		return null;
	}

	private binaryCandidates(): string[] {
		return [
			"/Applications/Soma/soma-daemon.app/Contents/MacOS/soma-daemon",
			"/usr/local/bin/soma-daemon",
			"/opt/homebrew/bin/soma-daemon",
			join(process.resourcesPath, "soma-daemon"),
			join(process.resourcesPath, "bin", "soma-daemon"),
			resolve(process.cwd(), "target", "debug", "soma-daemon"),
			resolve(process.cwd(), "target", "release", "soma-daemon"),
		];
	}
}
