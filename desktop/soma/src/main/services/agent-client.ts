import * as grpc from "@grpc/grpc-js";
import {
	type ChatStreamEvent,
	AgentClient as GrpcAgentClient,
	type ListModelsResponse,
	ModelKind,
} from "@soma/proto/agent/v1/agent";
import Long from "long";

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type ChatOptions = {
	model?: string;
	temperature?: number;
	maxTokens?: number;
};

export type StreamEvent = {
	token?: string;
	done?: boolean;
	error?: string;
	ready?: boolean;
};

export type AgentModel = {
	name: string;
	kind: "chat" | "embed" | "unknown";
	path: string;
	loaded: boolean;
	sizeBytes?: number;
};

const AGENT_SOCKET = process.env.SOMA_AGENTD_SOCKET || "/tmp/soma-agentd.sock";

export class AgentClient {
	private client: GrpcAgentClient;

	constructor() {
		const address = `unix://${AGENT_SOCKET}`;
		this.client = new GrpcAgentClient(
			address,
			grpc.credentials.createInsecure(),
		);
	}

	async chatStream(
		messages: ChatMessage[],
		options: ChatOptions = {},
	): Promise<StreamEvent> {
		try {
			const stream: grpc.ClientReadableStream<ChatStreamEvent> =
				this.client.chatStream({
					model: options.model ?? "",
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
					temperature: options.temperature ?? 0,
					maxTokens: Long.fromNumber(options.maxTokens ?? 256),
				});

			let combined = "";
			return await new Promise<StreamEvent>((resolve, reject) => {
				stream.on("data", (chunk: ChatStreamEvent) => {
					if (chunk.token) combined += chunk.token;
					if (chunk.done?.content) combined += chunk.done.content;
				});
				stream.on("end", () => resolve({ token: combined, done: true }));
				stream.on("error", (err) => reject(err));
			});
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error) };
		}
	}

	async listModels(): Promise<AgentModel[]> {
		try {
			const res = await new Promise<ListModelsResponse>((resolve, reject) => {
				this.client.listModels({}, (err, response) => {
					if (err) return reject(err);
					resolve(response);
				});
			});
			return (res.models ?? []).map((m) => ({
				name: m.name,
				kind: this.normalizeKind(m.kind),
				path: m.path,
				loaded: !!m.loaded,
				sizeBytes: m.sizeBytes ? Number(m.sizeBytes) : undefined,
			}));
		} catch (err: any) {
			if (err?.code === grpc.status.UNIMPLEMENTED) {
				const status: any = await new Promise((resolve, reject) => {
					this.client.status({}, (error, response) => {
						if (error) return reject(error);
						resolve(response);
					});
				});
				return (status.models ?? []).map((m: any) => ({
					name: m.name,
					kind: this.normalizeKind(m.kind),
					path: m.path,
					loaded: !!m.loaded,
					sizeBytes: m.size_bytes ? Number(m.size_bytes) : undefined,
				}));
			}
			throw err;
		}
	}

	private normalizeKind(kind: ModelKind): AgentModel["kind"] {
		if (kind === ModelKind.MODEL_KIND_CHAT) return "chat";
		if (kind === ModelKind.MODEL_KIND_EMBED) return "embed";
		return "unknown";
	}
}
