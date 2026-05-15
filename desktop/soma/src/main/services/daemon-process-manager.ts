import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { StageRuntimeConfig } from "@soma/desktop-config";
import { app } from "electron";
import type { DaemonClient, DaemonStatus } from "./daemon-client";
import type { AppLogger } from "./logger";

export type DaemonRuntimeStatus = {
	reachable: boolean;
	socketPath: string;
	peerId?: string;
	listenAddrs: string[];
	error?: string;
	socket?: {
		exists: boolean;
		uid?: number;
		gid?: number;
		mode?: number;
		ownedByCurrentUser?: boolean;
	};
};

export type DaemonControlAction = "start" | "stop" | "restart";

export type DaemonControlResult = {
	ok: boolean;
	action: DaemonControlAction;
	status: DaemonRuntimeStatus;
	message?: string;
};

type ServiceCommandResult = {
	ok: boolean;
	message?: string;
};

export class DaemonProcessManager {
	private child: ChildProcessWithoutNullStreams | null = null;
	private readonly serviceLabel = "digital.camer.soma.daemon";
	private readonly systemdUnit = "soma-daemon.service";

	constructor(
		private readonly runtimeConfig: StageRuntimeConfig,
		private readonly daemon: DaemonClient,
		private readonly logger: AppLogger,
		private readonly isDev: boolean,
	) {}

	async status(): Promise<DaemonRuntimeStatus> {
		const socket = this.inspectSocket();
		try {
			const status = await this.daemon.status();
			return this.toRuntimeStatus(status, socket);
		} catch (error) {
			return {
				reachable: false,
				socketPath: this.runtimeConfig.daemonSocketPath,
				listenAddrs: [],
				error: error instanceof Error ? error.message : String(error),
				socket,
			};
		}
	}

	async control(action: DaemonControlAction): Promise<DaemonControlResult> {
		if (action === "restart") {
			await this.stop();
			await sleep(350);
			const result = await this.start();
			return {
				...result,
				action,
			};
		}
		return action === "start" ? this.start() : this.stop();
	}

	private async start(): Promise<DaemonControlResult> {
		await this.ensureSocketParent();
		this.removeUserOwnedStaleSocket();

		const serviceResult = await this.startUserService();
		if (!serviceResult.ok) {
			this.logger.log("warn", "daemon user service start failed; trying direct daemon launch", {
				error: serviceResult.message,
			});
			await this.startDirectProcess();
		}

		const status = await this.waitForReachable(8_000);
		return {
			ok: status.reachable,
			action: "start",
			status,
			message: status.reachable ? "daemon is reachable" : (status.error ?? serviceResult.message),
		};
	}

	private async stop(): Promise<DaemonControlResult> {
		const serviceResult = await this.stopUserService();
		if (this.child && !this.child.killed) {
			this.child.kill("SIGTERM");
			this.child = null;
		}
		await sleep(350);
		const status = await this.status();
		return {
			ok: !status.reachable,
			action: "stop",
			status,
			message: status.reachable ? "daemon is still reachable" : serviceResult.message,
		};
	}

	private async waitForReachable(timeoutMs: number): Promise<DaemonRuntimeStatus> {
		const deadline = Date.now() + timeoutMs;
		let latest = await this.status();
		while (!latest.reachable && Date.now() < deadline) {
			await sleep(350);
			latest = await this.status();
		}
		return latest;
	}

	private toRuntimeStatus(status: DaemonStatus, socket: DaemonRuntimeStatus["socket"]): DaemonRuntimeStatus {
		return {
			reachable: !!status.peerId,
			socketPath: this.runtimeConfig.daemonSocketPath,
			peerId: status.peerId,
			listenAddrs: status.listenAddrs,
			socket,
		};
	}

	private async ensureSocketParent(): Promise<void> {
		await mkdir(dirname(this.runtimeConfig.daemonSocketPath), {
			recursive: true,
		});
	}

	private inspectSocket(): DaemonRuntimeStatus["socket"] {
		const path = this.runtimeConfig.daemonSocketPath;
		if (!existsSync(path)) {
			return {
				exists: false,
			};
		}

		try {
			const stat = statSync(path);
			const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
			return {
				exists: true,
				uid: stat.uid,
				gid: stat.gid,
				mode: stat.mode,
				ownedByCurrentUser: typeof uid === "number" ? stat.uid === uid : undefined,
			};
		} catch {
			return {
				exists: true,
			};
		}
	}

	private removeUserOwnedStaleSocket(): void {
		const socket = this.inspectSocket();
		if (!socket?.exists || socket.ownedByCurrentUser !== true) return;
		try {
			unlinkSync(this.runtimeConfig.daemonSocketPath);
		} catch (error) {
			this.logger.log("warn", "failed to remove stale daemon socket", {
				socketPath: this.runtimeConfig.daemonSocketPath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async startUserService(): Promise<ServiceCommandResult> {
		if (process.platform === "darwin") {
			const uid = typeof process.getuid === "function" ? process.getuid() : null;
			if (uid === null) return { ok: false, message: "current uid unavailable" };
			const plist = `/Library/LaunchAgents/${this.serviceLabel}.plist`;
			if (!existsSync(plist)) return { ok: false, message: `${plist} not found` };

			const bootstrap = await runCommand("launchctl", ["bootstrap", `gui/${uid}`, plist]);
			if (!bootstrap.ok && !bootstrap.message?.includes("already bootstrapped")) {
				return bootstrap;
			}
			return runCommand("launchctl", ["kickstart", "-k", `gui/${uid}/${this.serviceLabel}`]);
		}

		if (process.platform === "linux") {
			return runCommand("systemctl", ["--user", "start", this.systemdUnit]);
		}

		return { ok: false, message: `unsupported service platform ${process.platform}` };
	}

	private async stopUserService(): Promise<ServiceCommandResult> {
		if (process.platform === "darwin") {
			const uid = typeof process.getuid === "function" ? process.getuid() : null;
			if (uid === null) return { ok: false, message: "current uid unavailable" };
			const plist = `/Library/LaunchAgents/${this.serviceLabel}.plist`;
			if (existsSync(plist)) {
				return runCommand("launchctl", ["bootout", `gui/${uid}`, plist]);
			}
			return runCommand("launchctl", ["bootout", `gui/${uid}/${this.serviceLabel}`]);
		}

		if (process.platform === "linux") {
			return runCommand("systemctl", ["--user", "stop", this.systemdUnit]);
		}

		return { ok: false, message: `unsupported service platform ${process.platform}` };
	}

	private async startDirectProcess(): Promise<void> {
		if (this.child && !this.child.killed) return;
		const binary = this.findDaemonBinary();
		if (!binary) {
			this.logger.log("warn", "no soma-daemon binary found for direct launch");
			return;
		}

		const dataDir = join(app.getPath("userData"), "daemon");
		await mkdir(dataDir, {
			recursive: true,
		});
		const args = [
			"--socket-path",
			this.runtimeConfig.daemonSocketPath,
			"--db-path",
			join(dataDir, "daemon.db"),
			"--blob-dir",
			join(dataDir, "blobs"),
			"--listen-addrs",
			"/ip4/0.0.0.0/tcp/0/ws",
		];

		this.child = spawn(binary.command, [...binary.prefixArgs, ...args], {
			cwd: binary.cwd,
			env: {
				...process.env,
				SOMA_LOGS_DIR: join(app.getPath("logs"), "daemon"),
			},
			stdio: "pipe",
		});

		this.child.on("exit", (code, signal) => {
			this.logger.log("info", "direct soma-daemon process exited", {
				code,
				signal,
			});
			this.child = null;
		});
		this.child.stderr.on("data", (chunk) => {
			this.logger.log("warn", "soma-daemon stderr", {
				message: chunk.toString(),
			});
		});
	}

	private findDaemonBinary(): { command: string; prefixArgs: string[]; cwd?: string } | null {
		const envPath = process.env.SOMA_DAEMON_BIN?.trim();
		if (envPath) return { command: envPath, prefixArgs: [] };

		for (const candidate of [
			"/usr/local/bin/soma-daemon",
			"/opt/homebrew/bin/soma-daemon",
			join(process.resourcesPath, "soma-daemon"),
			join(process.resourcesPath, "bin", "soma-daemon"),
			resolve(process.cwd(), "target", "debug", "soma-daemon"),
			resolve(process.cwd(), "target", "release", "soma-daemon"),
		]) {
			if (existsSync(candidate)) {
				return {
					command: candidate,
					prefixArgs: [],
				};
			}
		}

		if (this.isDev && existsSync(resolve(process.cwd(), "Cargo.toml"))) {
			return {
				command: "cargo",
				prefixArgs: ["run", "-p", "soma-daemon", "--"],
				cwd: process.cwd(),
			};
		}

		const homeBinary = join(homedir(), ".local", "bin", "soma-daemon");
		if (existsSync(homeBinary)) {
			return {
				command: homeBinary,
				prefixArgs: [],
			};
		}

		return null;
	}
}

function runCommand(command: string, args: string[]): Promise<ServiceCommandResult> {
	return new Promise((resolveResult) => {
		const child = spawn(command, args, {
			stdio: "pipe",
		});
		let stderr = "";
		let stdout = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			resolveResult({
				ok: false,
				message: error.message,
			});
		});
		child.on("close", (code) => {
			resolveResult({
				ok: code === 0,
				message: (stderr || stdout).trim() || undefined,
			});
		});
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => {
		setTimeout(resolveSleep, ms);
	});
}
