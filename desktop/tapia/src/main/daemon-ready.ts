import { stat } from "node:fs/promises";

export async function waitForDaemonSocket(socketPath: string): Promise<void> {
	while (true) {
		try {
			const info = await stat(socketPath);
			if (info.isSocket()) return;
		} catch {
			// Keep waiting until daemon socket is ready.
		}
		await sleep(500);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
