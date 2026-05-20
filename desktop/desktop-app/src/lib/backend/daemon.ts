import { call } from "./client";
import type { DaemonStatus } from "./types";

export type DaemonControlAction = "start" | "stop" | "restart";

export const daemon = {
	status: () => call<DaemonStatus>("daemon_status"),
	/** True once the embedded daemon has finished `start()`. */
	isReady: () => call<boolean>("daemon_ready"),
	control: (action: DaemonControlAction) => call<{ running: boolean }>("daemon_control", { args: { action } }),
};
