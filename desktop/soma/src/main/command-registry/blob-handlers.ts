import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerBlobHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("blobs_stage", (_event, params) => context.blobs.stage(params));
	ipc.handle("blobs_stage_payload", (_event, params) => context.blobs.stagePayload(params));
	ipc.handle("blobs_stage_from_payload", (_event, params) => context.blobs.stageFromPayload(params));
}
