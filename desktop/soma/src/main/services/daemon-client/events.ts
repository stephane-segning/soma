import type {
	DaemonEvent as GrpcDaemonEvent,
	StreamEventsRequest,
} from "@soma/proto/daemon/v1/daemon";

import type { DaemonGrpcClient } from "./connection";
import { mapDaemonEvent } from "./mappers";
import type { DaemonStreamHandlers } from "./types";

export function streamEvents(client: DaemonGrpcClient, handlers: DaemonStreamHandlers): () => void {
	const request: StreamEventsRequest = {};
	const stream = client.streamEvents(request);

	stream.on("data", (event: GrpcDaemonEvent) => {
		const mapped = mapDaemonEvent(event);
		if (mapped) {
			handlers.onEvent(mapped);
		}
	});

	stream.on("error", (error: Error) => {
		handlers.onError?.(error);
	});

	stream.on("end", () => {
		handlers.onEnd?.();
	});

	return () => {
		stream.cancel();
	};
}
