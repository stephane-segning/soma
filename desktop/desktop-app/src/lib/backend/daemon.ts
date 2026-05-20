import { call } from "./client";
import type { DaemonStatus } from "./types";

export const daemon = {
	status: () => call<DaemonStatus>("daemon_status"),
	/** True once the embedded daemon has finished `start()`. */
	isReady: () => call<boolean>("daemon_ready"),
};
