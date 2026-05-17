import * as grpc from "@grpc/grpc-js";
import { DaemonClient as GrpcDaemonClient } from "@soma/proto/daemon/v1/daemon";

export type DaemonGrpcClient = GrpcDaemonClient;

export function createDaemonGrpcClient(socketPath: string): DaemonGrpcClient {
	const address = `unix://${socketPath}`;
	return new GrpcDaemonClient(address, grpc.credentials.createInsecure());
}

export function unary<TResponse>(
	call: (callback: (err: grpc.ServiceError | null, response?: TResponse) => void) => void,
	timeoutMs = 5_000,
): Promise<TResponse> {
	return new Promise<TResponse>((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			settled = true;
			reject(new Error(`Daemon RPC timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		try {
			call((err, response) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				if (err) return reject(err);
				if (response === undefined) return reject(new Error("Daemon returned empty response"));
				resolve(response);
			});
		} catch (error) {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(error);
		}
	});
}

export function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === grpc.status.NOT_FOUND
	);
}
