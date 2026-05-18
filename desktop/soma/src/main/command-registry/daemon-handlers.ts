import type { IpcMain } from "electron";
import type { DaemonClient } from "../services/daemon-client";
import type { CommandRegistryContext } from "./types";

/**
 * Legacy IPC surface — the renderer still calls `daemon_status` and
 * `daemon_control` from the settings panel. With the embedded `@soma/node`
 * addon the runtime is always in-process, so we return a synthetic
 * `reachable: true` status and treat control actions as no-ops.
 *
 * The renderer's `DaemonRuntimeStatus` / `DaemonControlResult` shape lives in
 * `renderer/src/services/daemon-service.ts`. Keep this response in sync if
 * that contract ever changes.
 */
type DaemonControlAction = "start" | "stop" | "restart";

const EMBEDDED_SOCKET_PATH = "<embedded:@soma/node>";

export function registerDaemonHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("daemon_status", () => buildStatus(context.daemon));
	ipc.handle("daemon_control", (_event, params) => buildControlResult(context.daemon, normalize(params?.action)));
}

async function buildStatus(daemon: DaemonClient) {
	try {
		const status = await daemon.status();
		return {
			reachable: true,
			socketPath: EMBEDDED_SOCKET_PATH,
			peerId: status.peerId,
			listenAddrs: status.listenAddrs,
			socket: { exists: true, ownedByCurrentUser: true },
		};
	} catch (error) {
		return {
			reachable: false,
			socketPath: EMBEDDED_SOCKET_PATH,
			listenAddrs: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function buildControlResult(daemon: DaemonClient, action: DaemonControlAction) {
	const status = await buildStatus(daemon);
	return {
		ok: status.reachable,
		action,
		status,
		message: status.reachable ? "embedded runtime is always available" : status.error,
	};
}

function normalize(action: unknown): DaemonControlAction {
	if (action === "stop" || action === "restart") return action;
	return "start";
}
