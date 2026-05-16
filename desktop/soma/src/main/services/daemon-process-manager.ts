import type { StageRuntimeConfig } from "@soma/desktop-config";
import type { DaemonClient } from "./daemon-client";
import { DirectDaemonProcess } from "./daemon-process-manager/direct-process";
import {
	ensureSocketParent,
	inspectSocket,
	removeUserOwnedStaleSocket,
	toRuntimeStatus,
	waitForReachable,
} from "./daemon-process-manager/status";
import type { DaemonControlAction, DaemonControlResult, DaemonRuntimeStatus } from "./daemon-process-manager/types";
import { startUserService, stopUserService } from "./daemon-process-manager/user-service";
import type { AppLogger } from "./logger";

export type { DaemonControlAction, DaemonControlResult, DaemonRuntimeStatus };

export class DaemonProcessManager {
	private readonly directProcess: DirectDaemonProcess;

	constructor(
		private readonly runtimeConfig: StageRuntimeConfig,
		private readonly daemon: DaemonClient,
		private readonly logger: AppLogger,
		isDev: boolean,
	) {
		this.directProcess = new DirectDaemonProcess(runtimeConfig, logger, isDev);
	}

	async status(): Promise<DaemonRuntimeStatus> {
		const socket = inspectSocket(this.runtimeConfig.daemonSocketPath);
		try {
			const status = await this.daemon.status();
			return toRuntimeStatus(this.runtimeConfig.daemonSocketPath, status, socket);
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
			return { ...result, action };
		}
		return action === "start" ? this.start() : this.stop();
	}

	private async start(): Promise<DaemonControlResult> {
		await ensureSocketParent(this.runtimeConfig.daemonSocketPath);
		removeUserOwnedStaleSocket(this.runtimeConfig.daemonSocketPath, this.logger);

		const serviceResult = await startUserService();
		if (!serviceResult.ok) {
			this.logger.log("warn", "daemon user service start failed; trying direct daemon launch", {
				error: serviceResult.message,
			});
			await this.directProcess.start();
		}

		const status = await waitForReachable(() => this.status(), 8_000);
		return {
			ok: status.reachable,
			action: "start",
			status,
			message: status.reachable ? "daemon is reachable" : (status.error ?? serviceResult.message),
		};
	}

	private async stop(): Promise<DaemonControlResult> {
		const serviceResult = await stopUserService();
		this.directProcess.stop();
		await sleep(350);
		const status = await this.status();
		return {
			ok: !status.reachable,
			action: "stop",
			status,
			message: status.reachable ? "daemon is still reachable" : serviceResult.message,
		};
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => {
		setTimeout(resolveSleep, ms);
	});
}
