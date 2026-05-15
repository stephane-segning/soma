import type { StatusResponse } from "@soma/proto/daemon/v1/daemon";

import type { DaemonGrpcClient } from "./connection";
import { unary } from "./connection";
import type { DaemonStatus } from "./types";

export async function status(client: DaemonGrpcClient): Promise<DaemonStatus> {
	const res = await unary<StatusResponse>((callback) => {
		client.status({}, callback);
	});

	return {
		peerId: res.peerId ?? "",
		listenAddrs: res.listenAddrs ?? [],
	};
}
