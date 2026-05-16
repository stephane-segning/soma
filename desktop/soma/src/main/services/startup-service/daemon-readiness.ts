import type { DaemonClient } from "../daemon-client";
import type { DaemonProcessManager } from "../daemon-process-manager";
import type { AppLogger } from "../logger";

export async function checkDaemonOnce(daemon: DaemonClient, logger: AppLogger): Promise<void> {
	logger.log("info", "checking daemon readiness");
	try {
		const status = await daemon.status();
		if (status.peerId) {
			logger.log("info", "daemon ready", {
				peerId: status.peerId,
				listenAddrs: status.listenAddrs,
			});
			return;
		}
		logger.log("warn", "daemon status reported without peer id");
	} catch (error) {
		logger.log("warn", "daemon unavailable at startup; opening app anyway", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function ensureDaemonInBackground(daemonProcess: DaemonProcessManager, logger: AppLogger): Promise<void> {
	try {
		const status = await daemonProcess.status();
		if (status.reachable) return;

		logger.log("warn", "daemon is unavailable; attempting background start", {
			socketPath: status.socketPath,
			socketExists: status.socket?.exists,
			socketOwnedByCurrentUser: status.socket?.ownedByCurrentUser,
			error: status.error,
		});

		const result = await daemonProcess.control("start");
		logger.log(result.ok ? "info" : "warn", "background daemon start finished", {
			ok: result.ok,
			message: result.message,
			reachable: result.status.reachable,
			socketPath: result.status.socketPath,
		});
	} catch (error) {
		logger.log("warn", "background daemon start failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
