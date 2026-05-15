import type { DaemonClient } from "../daemon-client";
import type { AppLogger } from "../logger";

export async function waitForDaemonReady(daemon: DaemonClient, logger: AppLogger): Promise<void> {
	let attempts = 0;
	logger.log("info", "waiting for daemon readiness");
	while (true) {
		attempts += 1;
		try {
			const status = await daemon.status();
			if (status.peerId) {
				logger.log("info", "daemon ready", {
					peerId: status.peerId,
					listenAddrs: status.listenAddrs,
				});
				return;
			}
			if (attempts % 20 === 0) {
				logger.log("warn", "daemon status reported without peer id yet", {
					attempt: attempts,
				});
			}
		} catch (error) {
			if (attempts === 1 || attempts % 20 === 0) {
				logger.log("warn", "daemon not ready yet", {
					attempt: attempts,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		await sleep(500);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
