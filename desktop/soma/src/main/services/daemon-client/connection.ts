import * as grpc from "@grpc/grpc-js";
import { DaemonClient as GrpcDaemonClient } from "@soma/proto/daemon/v1/daemon";

export type DaemonGrpcClient = GrpcDaemonClient;

export function createDaemonGrpcClient(socketPath: string): DaemonGrpcClient {
	const address = `unix://${socketPath}`;
	return new GrpcDaemonClient(address, grpc.credentials.createInsecure());
}

export function unary<TResponse>(
	call: (callback: (err: grpc.ServiceError | null, response?: TResponse) => void) => void,
): Promise<TResponse> {
	return new Promise<TResponse>((resolve, reject) => {
		call((err, response) => {
			if (err) return reject(err);
			if (response === undefined) return reject(new Error("Daemon returned empty response"));
			resolve(response);
		});
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
