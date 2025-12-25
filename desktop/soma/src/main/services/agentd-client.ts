import { basename, join, resolve } from "node:path";
import type grpc from "@grpc/grpc-js";
import { credentials, loadPackageDefinition, Metadata } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { app } from "electron";
import log from "electron-log";
import { accessSync } from "fs-extra";
import { injectable } from "inversify";
import { Observable } from "rxjs";

type EmptyRequest = Record<string, never>;

type ModelInfo = {
	name: string;
	kind: number;
	path: string;
	loaded: boolean;
};

type StatusResponseWire = {
	version: string;
	default_chat_model: string;
	default_embed_model: string;
	models: ModelInfo[];
};

type InlineCompleteRequest = { prompt: string; context: string; model: string };
type InlineCompleteResponse = { completion: string; model: string };

type ChatMessage = { role: string; content: string };
type ChatRequestWire = {
	model: string;
	messages: ChatMessage[];
	temperature: number;
	max_tokens: number;
};

type ChatResponse = { model: string; content: string };
type ChatStreamEvent = { token?: string; done?: ChatResponse };

type EmbedRequestWire = { model: string; input: string[] };
type EmbedVector = { values: number[] };
type EmbedResponse = { model: string; embeddings: EmbedVector[] };

type GrpcAgentClient = grpc.Client & {
	Status(
		request: EmptyRequest,
		callback: grpc.requestCallback<StatusResponseWire>,
	): grpc.ClientUnaryCall;
	InlineComplete(
		request: InlineCompleteRequest,
		callback: grpc.requestCallback<InlineCompleteResponse>,
	): grpc.ClientUnaryCall;
	Chat(
		request: ChatRequestWire,
		callback: grpc.requestCallback<ChatResponse>,
	): grpc.ClientUnaryCall;
	ChatStream(
		request: ChatRequestWire,
		metadata?: Metadata,
	): grpc.ClientReadableStream<ChatStreamEvent>;
	Embed(
		request: EmbedRequestWire,
		callback: grpc.requestCallback<EmbedResponse>,
	): grpc.ClientUnaryCall;
};

export type AgentdStatus = {
	version: string;
	defaultChatModel: string;
	defaultEmbedModel: string;
	models: ModelInfo[];
};

@injectable()
export class AgentdClient {
	private readonly logger = log.scope("agentd-client");
	private socketPath: string;
	private client: GrpcAgentClient | null = null;

	constructor() {
		this.socketPath = this.resolveDefaultSocketPath();
	}

	setSocketPath(socketPath: string): void {
		if (socketPath && socketPath !== this.socketPath) {
			this.socketPath = socketPath;
			this.client = null;
		}
	}

	async status(): Promise<AgentdStatus> {
		const wire = await this.callUnary<EmptyRequest, StatusResponseWire>(
			(client, req, cb) => client.Status(req, cb),
			{},
		);
		return {
			version: wire.version,
			defaultChatModel: wire.default_chat_model,
			defaultEmbedModel: wire.default_embed_model,
			models: wire.models ?? [],
		};
	}

	async inlineComplete(input: {
		prompt: string;
		context?: string;
		model?: string;
	}): Promise<{ completion: string; model: string }> {
		const req: InlineCompleteRequest = {
			prompt: input.prompt,
			context: input.context ?? "",
			model: input.model ?? "",
		};
		return this.callUnary<InlineCompleteRequest, InlineCompleteResponse>(
			(client, request, cb) => client.InlineComplete(request, cb),
			req,
		);
	}

	async chat(input: {
		messages: ChatMessage[];
		model?: string;
		temperature?: number;
		maxTokens?: number;
	}): Promise<{ content: string; model: string }> {
		const req: ChatRequestWire = {
			model: input.model ?? "",
			messages: input.messages,
			temperature: input.temperature ?? 0.7,
			max_tokens: input.maxTokens ?? 256,
		};
		return this.callUnary<ChatRequestWire, ChatResponse>(
			(client, request, cb) => client.Chat(request, cb),
			req,
		);
	}

	chatStream(input: {
		messages: ChatMessage[];
		model?: string;
		temperature?: number;
		maxTokens?: number;
	}): Observable<ChatStreamEvent> {
		const req: ChatRequestWire = {
			model: input.model ?? "",
			messages: input.messages,
			temperature: input.temperature ?? 0.7,
			max_tokens: input.maxTokens ?? 256,
		};

		const stream = this.getClient().ChatStream(req, new Metadata());
		return new Observable<ChatStreamEvent>((subscriber) => {
			stream.on("data", (event) => subscriber.next(event));
			stream.on("error", (err) => subscriber.error(err));
			stream.on("end", () => subscriber.complete());

			return () => {
				stream.cancel();
			};
		});
	}

	async embed(input: { input: string[]; model?: string }): Promise<number[][]> {
		const req: EmbedRequestWire = {
			model: input.model ?? "",
			input: input.input,
		};
		const res = await this.callUnary<EmbedRequestWire, EmbedResponse>(
			(client, request, cb) => client.Embed(request, cb),
			req,
		);
		return (res.embeddings ?? []).map((v) => v.values ?? []);
	}

	private getClient(): GrpcAgentClient {
		if (this.client) return this.client;
		const protoPath = this.resolveProtoPath();
		const includeDirs = this.resolveProtoIncludeDirs(protoPath);
		this.logger.info(`Using agentd proto at ${protoPath}`);
		const definition = loadPackageDefinition(
			loadSync(protoPath, {
				keepCase: true,
				enums: String,
				longs: String,
				defaults: true,
				oneofs: true,
				includeDirs,
			}),
		) as unknown as {
			agent: { v1: { Agent: new (...args: unknown[]) => GrpcAgentClient } };
		};

		const target = `unix:${this.socketPath}`;
		this.logger.info(`Connecting to soma-agentd at ${target}`);
		this.client = new definition.agent.v1.Agent(
			target,
			credentials.createInsecure(),
		);
		return this.client;
	}

	private resolveDefaultSocketPath(): string {
		const fromEnv = process.env.SOMA_AGENTD_SOCKET;
		if (fromEnv?.trim()) return fromEnv.trim();

		// Keep default aligned with agentd CLI default.
		return "/tmp/soma-agentd.sock";
	}

	private resolveProtoPath(): string {
		const appRoot = app.isReady() ? app.getAppPath() : process.cwd();
		const envOverride = process.env.SOMA_AGENTD_PROTO;

		const candidates = [
			envOverride ? resolve(envOverride) : null,
			join(appRoot, "proto", "agent", "v1", "agent.proto"),
			join(appRoot, "../../proto/agent/v1/agent.proto"),
		].filter(Boolean) as string[];

		for (const candidate of candidates) {
			try {
				accessSync(candidate);
				return candidate;
			} catch {
				// try next
			}
		}

		this.logger.error("Failed to locate agentd proto");
		throw new Error(
			`Unable to locate agentd proto; tried ${candidates
				.map((p) => `"${p}"`)
				.join(", ")}`,
		);
	}

	private resolveProtoIncludeDirs(protoPath: string): string[] {
		const env = process.env.SOMA_AGENTD_PROTO_INCLUDE_DIRS;
		if (env?.trim()) {
			return env
				.split(",")
				.map((p) => p.trim())
				.filter(Boolean)
				.map((p) => resolve(p));
		}

		let cur = resolve(protoPath, "..");
		for (let i = 0; i < 6; i++) {
			if (basename(cur) === "proto") break;
			const candidate = resolve(cur, "..");
			if (candidate === cur) break;
			cur = candidate;
		}

		const protoRoot =
			basename(cur) === "proto" ? cur : resolve(protoPath, "../../../..");
		return [protoRoot];
	}

	private callUnary<Req, Res>(
		invoker: (
			client: GrpcAgentClient,
			request: Req,
			callback: grpc.requestCallback<Res>,
		) => grpc.ClientUnaryCall,
		request: Req,
	): Promise<Res> {
		return new Promise<Res>((resolvePromise, reject) => {
			const client = this.getClient();
			invoker(client, request, (err, response) => {
				if (err) {
					this.logger.error("Agentd call failed", err);
					reject(err);
					return;
				}
				if (!response) {
					reject(new Error("Empty response from soma-agentd"));
					return;
				}
				resolvePromise(response);
			});
		});
	}
}
