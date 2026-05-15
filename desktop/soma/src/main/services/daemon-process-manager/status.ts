import { existsSync, statSync, unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { DaemonStatus } from "../daemon-client";
import type { AppLogger } from "../logger";
import type { DaemonRuntimeStatus } from "./types";

export function inspectSocket(path: string): DaemonRuntimeStatus["socket"] {
	if (!existsSync(path)) return { exists: false };

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
		return { exists: true };
	}
}

export function toRuntimeStatus(
	socketPath: string,
	status: DaemonStatus,
	socket: DaemonRuntimeStatus["socket"],
): DaemonRuntimeStatus {
	return {
		reachable: !!status.peerId,
		socketPath,
		peerId: status.peerId,
		listenAddrs: status.listenAddrs,
		socket,
	};
}

export async function ensureSocketParent(socketPath: string): Promise<void> {
	await mkdir(dirname(socketPath), { recursive: true });
}

export function removeUserOwnedStaleSocket(socketPath: string, logger: AppLogger): void {
	const socket = inspectSocket(socketPath);
	if (!socket?.exists || socket.ownedByCurrentUser !== true) return;
	try {
		unlinkSync(socketPath);
	} catch (error) {
		logger.log("warn", "failed to remove stale daemon socket", {
			socketPath,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function waitForReachable(
	readStatus: () => Promise<DaemonRuntimeStatus>,
	timeoutMs: number,
): Promise<DaemonRuntimeStatus> {
	const deadline = Date.now() + timeoutMs;
	let latest = await readStatus();
	while (!latest.reachable && Date.now() < deadline) {
		await sleep(350);
		latest = await readStatus();
	}
	return latest;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => {
		setTimeout(resolveSleep, ms);
	});
}
