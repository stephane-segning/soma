import type { IpcMain } from "electron";
import type { DaemonControlAction } from "../services/daemon-process-manager";
import type { CommandRegistryContext } from "./types";

export function registerDaemonHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("daemon_status", () => context.daemonProcess.status());
	ipc.handle("daemon_control", (_event, params) =>
		context.daemonProcess.control(normalizeDaemonControlAction(params?.action)),
	);
}

function normalizeDaemonControlAction(action: unknown): DaemonControlAction {
	if (action === "stop" || action === "restart") return action;
	return "start";
}
