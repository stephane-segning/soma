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

export type ServiceCommandResult = {
	ok: boolean;
	message?: string;
};

export type DaemonBinary = {
	command: string;
	prefixArgs: string[];
	cwd?: string;
};
