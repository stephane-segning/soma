/**
 * Renderer-side daemon service. Thin adapter over `@soma/sdk`'s
 * `backend.daemon.*` surface — no IPC channel names live here anymore.
 *
 * The SDK's `DaemonStatus` / `ControlResult` (declared in
 * `desktop-sdk/src/bindings/index.ts`, generated from the Rust source in
 * `desktop-api/src/daemon.rs`) is the single wire contract both shells
 * implement; the Electron handler in
 * `main/command-registry/daemon-handlers.ts` produces exactly the same
 * shape.
 */

import type {
	ControlAction as SdkControlAction,
	ControlResult as SdkControlResult,
	DaemonSocketInfo as SdkDaemonSocketInfo,
	DaemonStatus as SdkDaemonStatus,
} from "@soma/sdk";
import { backend } from "../lib/ipc";

export type DaemonRuntimeStatus = SdkDaemonStatus;
export type DaemonSocketInfo = SdkDaemonSocketInfo;
export type DaemonControlAction = SdkControlAction;
export type DaemonControlResult = SdkControlResult;

export function getDaemonStatus(): Promise<DaemonRuntimeStatus> {
	return backend.daemon.status();
}

export function controlDaemon(action: DaemonControlAction): Promise<DaemonControlResult> {
	return backend.daemon.control(action);
}
