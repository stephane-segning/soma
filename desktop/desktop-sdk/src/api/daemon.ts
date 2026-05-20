import type * as B from "../bindings";
import type { Transport } from "../transport";

export type DaemonControlAction = "start" | "stop" | "restart";

export function daemon(t: Transport) {
	return {
		status: () => t.invoke<B.DaemonStatus>("daemon_status"),
		isReady: () => t.invoke<boolean>("daemon_ready"),
		control: (action: DaemonControlAction) => t.invoke<B.ControlResult>("daemon_control", { args: { action } }),
	};
}
