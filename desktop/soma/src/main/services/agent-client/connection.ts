import * as grpc from "@grpc/grpc-js";
import { AgentClient as GrpcAgentClient } from "@soma/proto/agent/v1/agent";

export type AgentGrpcClient = GrpcAgentClient;

export function createAgentGrpcClient(socketPath: string): AgentGrpcClient {
	const address = `unix://${socketPath}`;
	return new GrpcAgentClient(address, grpc.credentials.createInsecure());
}

export function unary<TResponse>(
	call: (callback: (err: grpc.ServiceError | null, response?: TResponse) => void) => void,
): Promise<TResponse> {
	return new Promise<TResponse>((resolve, reject) => {
		call((err, response) => {
			if (err) return reject(err);
			if (response === undefined) return reject(new Error("agentd returned empty response"));
			resolve(response);
		});
	});
}

export function isUnimplemented(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === grpc.status.UNIMPLEMENTED
	);
}
