import { invoke } from "../lib/ipc";

export type DaemonRuntimeStatus = {
	reachable: boolean;
	socketPath: string;
	peerId?: string;
	listenAddrs: string[];
	error?: string;
	socket?: {
		exists: boolean;
		uid?: number;
		gid?: number;
		mode?: number;
		ownedByCurrentUser?: boolean;
	};
};

export type DaemonControlAction = "start" | "stop" | "restart";

export type DaemonControlResult = {
	ok: boolean;
	action: DaemonControlAction;
	status: DaemonRuntimeStatus;
	message?: string;
};

export function getDaemonStatus(): Promise<DaemonRuntimeStatus> {
	return invoke<DaemonRuntimeStatus>("daemon_status");
}

export function controlDaemon(action: DaemonControlAction): Promise<DaemonControlResult> {
	return invoke<DaemonControlResult>("daemon_control", {
		action,
	});
}
