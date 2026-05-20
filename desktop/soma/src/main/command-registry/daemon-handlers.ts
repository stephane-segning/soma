import type { ControlAction, ControlResult, DaemonStatus } from "@soma/sdk";
import type { IpcMain } from "electron";
import type { DaemonClient } from "../services/daemon-client";
import type { CommandRegistryContext } from "./types";

/**
 * Legacy IPC surface — the renderer still calls `daemon_status` and
 * `daemon_control` from the settings panel. With the embedded `@soma/node`
 * addon the runtime is always in-process, so we return a synthetic
 * `reachable: true` status and treat control actions as no-ops.
 *
 * The wire contract is the SDK's `DaemonStatus` / `ControlResult`
 * (declared in `desktop-sdk/src/bindings/index.ts`, generated from the
 * Rust source in `desktop-api/src/daemon.rs`). Keep this response in
 * sync with that contract.
 *
 * The SDK's `backend.daemon.control` wraps the action in
 * `{ args: { action } }`, but `electronTransport` unwraps the single-key
 * `args` envelope before calling `bridge.invoke`, so the handler still
 * receives the flat `{ action }` payload it always has.
 */
const EMBEDDED_SOCKET_PATH = "<embedded:@soma/node>";

export function registerDaemonHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("daemon_status", () => buildStatus(context.daemon));
	ipc.handle("daemon_control", (_event, params) =>
		buildControlResult(context.daemon, normalize((params as { action?: unknown } | undefined)?.action)),
	);
}

async function buildStatus(daemon: DaemonClient): Promise<DaemonStatus> {
	try {
		const status = await daemon.status();
		return {
			reachable: true,
			socketPath: EMBEDDED_SOCKET_PATH,
			peerId: status.peerId,
			listenAddrs: status.listenAddrs,
			error: null,
			socket: { exists: true, uid: null, gid: null, mode: null, ownedByCurrentUser: true },
		};
	} catch (error) {
		return {
			reachable: false,
			socketPath: EMBEDDED_SOCKET_PATH,
			peerId: null,
			listenAddrs: [],
			error: error instanceof Error ? error.message : String(error),
			socket: null,
		};
	}
}

async function buildControlResult(daemon: DaemonClient, action: ControlAction): Promise<ControlResult> {
	const status = await buildStatus(daemon);
	return {
		ok: status.reachable,
		action,
		status,
		message: status.reachable ? "embedded runtime is always available" : (status.error ?? null),
	};
}

function normalize(action: unknown): ControlAction {
	if (action === "stop" || action === "restart") return action;
	return "start";
}
