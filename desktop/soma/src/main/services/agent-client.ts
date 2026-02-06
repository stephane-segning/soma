import * as grpc from "@grpc/grpc-js";
import {
	type ChatStreamEvent,
	AgentClient as GrpcAgentClient,
	type ListModelsResponse,
	ModelKind,
} from "@soma/proto/agent/v1/agent";
import Long from "long";
import {
	type AgentProvider,
	type AgentRuntimeConfig,
	normalizeAgentRuntimeConfig,
} from "./agent-config";

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

export type AgentRuntimeEvent =
	| {
			kind: "ready";
			atMs: number;
			provider: AgentProvider;
			baseUrl: string;
	  }
	| {
			kind: "status";
			atMs: number;
			provider: AgentProvider;
			baseUrl: string;
			models: AgentModel[];
	  }
	| {
			kind: "error";
			atMs: number;
			provider: AgentProvider;
			baseUrl: string;
			error: string;
	  };

export type AgentRuntimeEventHandlers = {
	onEvent: (event: AgentRuntimeEvent) => void;
};

export type AgentModel = {
	name: string;
	kind: "chat" | "embed" | "unknown";
	path: string;
	loaded: boolean;
	sizeBytes?: number;
};

export type RerankCandidate = {
	id: string;
	content: string;
};

export type RerankParams = {
	query: string;
	candidates: RerankCandidate[];
	model?: string;
	topN?: number;
};

export type RerankResult = {
	id: string;
	score: number;
	rank: number;
};

export type ResolveDriftParams = {
	leftUpdateBase64: string;
	rightUpdateBase64: string;
};

export type ResolveDriftResult = {
	mergedUpdateBase64: string;
};

export class AgentClient {
	private client: GrpcAgentClient;
	private readonly readConfig: () => AgentRuntimeConfig;

	constructor(socketPath: string, readConfig?: () => unknown) {
		const address = `unix://${socketPath}`;
		this.client = new GrpcAgentClient(address, grpc.credentials.createInsecure());
		this.readConfig = () => normalizeAgentRuntimeConfig(readConfig?.());
	}

	async chatStream(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
		const config = this.readConfig();
		try {
			if (config.provider === "agentd") {
				return await this.chatStreamViaAgentd(messages, options);
			}
			if (config.provider === "llama-cpp") {
				return await this.chatStreamViaLlamaCpp(messages, options, config);
			}
			return await this.chatStreamViaOpenAi(messages, options, config);
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async listModels(): Promise<AgentModel[]> {
		const config = this.readConfig();
		if (config.provider === "agentd") {
			return this.listModelsViaAgentd();
		}
		if (config.provider === "llama-cpp") {
			return [
				{
					name: config.llamaCppChatModel,
					kind: "chat",
					path: config.llamaCppBaseUrl,
					loaded: true,
				},
			];
		}
		return this.listModelsViaOpenAi(config);
	}

	async rerank(params: RerankParams): Promise<RerankResult[]> {
		const config = this.readConfig();
		if (config.provider === "agentd") {
			return this.rerankViaAgentd(params);
		}
		if (!params.query?.trim()) {
			throw new Error("query is required");
		}
		if (!params.candidates?.length) {
			throw new Error("at least one candidate is required");
		}
		if (config.provider === "llama-cpp") {
			throw new Error("rerank is not available for llama-cpp provider");
		}
		return this.rerankViaOpenAi(params, config);
	}

	async resolveDrift(params: ResolveDriftParams): Promise<ResolveDriftResult> {
		return this.resolveDriftViaAgentd(params);
	}

	startEventStream(handlers: AgentRuntimeEventHandlers): () => void {
		let stopped = false;
		let timer: NodeJS.Timeout | null = null;
		let emittedReady = false;

		const run = async () => {
			if (stopped) return;
			const config = this.readConfig();
			const baseUrl = this.baseUrlForProvider(config);
			try {
				const models = await this.listModels();
				if (!emittedReady) {
					handlers.onEvent({
						kind: "ready",
						atMs: Date.now(),
						provider: config.provider,
						baseUrl,
					});
					emittedReady = true;
				}
				handlers.onEvent({
					kind: "status",
					atMs: Date.now(),
					provider: config.provider,
					baseUrl,
					models,
				});
			} catch (error) {
				handlers.onEvent({
					kind: "error",
					atMs: Date.now(),
					provider: config.provider,
					baseUrl,
					error: error instanceof Error ? error.message : String(error),
				});
			} finally {
				if (stopped) return;
				timer = setTimeout(run, Math.max(1_000, config.pollIntervalMs));
			}
		};

		void run();

		return () => {
			stopped = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		};
	}

	private async chatStreamViaAgentd(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
		try {
			const stream: grpc.ClientReadableStream<ChatStreamEvent> = this.client.chatStream({
				model: options.model ?? "",
				messages: messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
				temperature: options.temperature ?? 0,
				maxTokens: Long.fromNumber(options.maxTokens ?? 256),
			});

			let combined = "";
			return await new Promise<StreamEvent>((resolve, reject) => {
				stream.on("data", (chunk: ChatStreamEvent) => {
					if (chunk.token) combined += chunk.token;
					if (chunk.done?.content) combined += chunk.done.content;
				});
				stream.on("end", () =>
					resolve({
						token: combined,
						done: true,
					}),
				);
				stream.on("error", (err) => reject(err));
			});
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private async listModelsViaAgentd(): Promise<AgentModel[]> {
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

	private async rerankViaAgentd(params: RerankParams): Promise<RerankResult[]> {
		if (!params.query?.trim()) {
			throw new Error("query is required");
		}
		if (!params.candidates?.length) {
			throw new Error("at least one candidate is required");
		}

		const res = await new Promise<{
			results?: RerankResult[];
		}>((resolve, reject) => {
			this.client.rerank(
				{
					query: params.query,
					candidates: params.candidates,
					model: params.model ?? "",
					topN: params.topN ?? 0,
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});

		const results = res.results ?? [];
		return results.slice().sort((a, b) => a.rank - b.rank);
	}

	private async resolveDriftViaAgentd(params: ResolveDriftParams): Promise<ResolveDriftResult> {
		if (!params.leftUpdateBase64?.trim()) {
			throw new Error("leftUpdateBase64 is required");
		}
		if (!params.rightUpdateBase64?.trim()) {
			throw new Error("rightUpdateBase64 is required");
		}

		const leftUpdate = Buffer.from(params.leftUpdateBase64, "base64");
		const rightUpdate = Buffer.from(params.rightUpdateBase64, "base64");

		const res = await new Promise<{
			mergedUpdate?: Buffer;
		}>((resolve, reject) => {
			this.client.resolveDrift(
				{
					leftUpdate,
					rightUpdate,
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});

		const merged = res.mergedUpdate ?? Buffer.alloc(0);
		return {
			mergedUpdateBase64: merged.toString("base64"),
		};
	}

	private async chatStreamViaOpenAi(
		messages: ChatMessage[],
		options: ChatOptions,
		config: AgentRuntimeConfig,
	): Promise<StreamEvent> {
		const model = options.model?.trim() || config.openAiChatModel;
		const response = await this.requestJson<{
			choices?: Array<{
				message?: {
					content?: string;
				};
				text?: string;
			}>;
		}>({
			baseUrl: config.openAiBaseUrl,
			path: "/chat/completions",
			method: "POST",
			apiKey: config.openAiApiKey,
			timeoutMs: config.requestTimeoutMs,
			body: {
				model,
				messages: messages.map((message) => ({
					role: message.role,
					content: message.content,
				})),
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens ?? 256,
				stream: false,
			},
		});

		const content =
			response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text ?? "";

		return {
			token: content,
			done: true,
		};
	}

	private async chatStreamViaLlamaCpp(
		messages: ChatMessage[],
		options: ChatOptions,
		config: AgentRuntimeConfig,
	): Promise<StreamEvent> {
		const prompt = messages
			.map((message) => `${message.role.toUpperCase()}: ${message.content}`)
			.join("\n");

		const response = await this.requestJson<{
			content?: string;
			choices?: Array<{
				text?: string;
			}>;
		}>({
			baseUrl: config.llamaCppBaseUrl,
			path: "/completion",
			method: "POST",
			timeoutMs: config.requestTimeoutMs,
			body: {
				prompt,
				temperature: options.temperature ?? 0.7,
				n_predict: options.maxTokens ?? 256,
				stream: false,
			},
		});

		const content = response.content ?? response.choices?.[0]?.text ?? "";
		return {
			token: content,
			done: true,
		};
	}

	private async listModelsViaOpenAi(config: AgentRuntimeConfig): Promise<AgentModel[]> {
		const response = await this.requestJson<{
			data?: Array<{
				id?: string;
			}>;
		}>({
			baseUrl: config.openAiBaseUrl,
			path: "/models",
			method: "GET",
			apiKey: config.openAiApiKey,
			timeoutMs: config.requestTimeoutMs,
		});

		const models = (response.data ?? [])
			.map((model) => model.id?.trim() ?? "")
			.filter((model) => model.length > 0);

		return models.map((model) => ({
			name: model,
			kind:
				model === config.openAiEmbedModel
					? "embed"
					: model === config.openAiChatModel
						? "chat"
						: "unknown",
			path: config.openAiBaseUrl,
			loaded: true,
		}));
	}

	private async rerankViaOpenAi(params: RerankParams, config: AgentRuntimeConfig): Promise<RerankResult[]> {
		const model = params.model?.trim() || config.openAiEmbedModel;
		const texts = [params.query, ...params.candidates.map((candidate) => candidate.content)];

		const response = await this.requestJson<{
			data?: Array<{
				index?: number;
				embedding?: number[];
			}>;
		}>({
			baseUrl: config.openAiBaseUrl,
			path: "/embeddings",
			method: "POST",
			apiKey: config.openAiApiKey,
			timeoutMs: config.requestTimeoutMs,
			body: {
				model,
				input: texts,
			},
		});

		const embeddings = new Array<number[] | undefined>(texts.length).fill(undefined);
		for (const item of response.data ?? []) {
			const index = item.index ?? -1;
			if (index < 0 || index >= embeddings.length) continue;
			if (!item.embedding) continue;
			embeddings[index] = item.embedding;
		}

		const queryEmbedding = embeddings[0];
		if (!queryEmbedding) {
			throw new Error("missing query embedding");
		}

		const scored: RerankResult[] = [];
		for (let index = 0; index < params.candidates.length; index += 1) {
			const embedding = embeddings[index + 1];
			if (!embedding) continue;
			const candidate = params.candidates[index];
			scored.push({
				id: candidate.id,
				score: cosineSimilarity(queryEmbedding, embedding),
				rank: 0,
			});
		}

		scored.sort((left, right) => right.score - left.score);
		const topN = params.topN && params.topN > 0 ? params.topN : scored.length;

		return scored.slice(0, topN).map((result, index) => ({
			...result,
			rank: index + 1,
		}));
	}

	private baseUrlForProvider(config: AgentRuntimeConfig): string {
		if (config.provider === "agentd") {
			return "unix://local-agentd";
		}
		if (config.provider === "llama-cpp") {
			return config.llamaCppBaseUrl;
		}
		return config.openAiBaseUrl;
	}

	private async requestJson<T>(options: {
		baseUrl: string;
		path: string;
		method: "GET" | "POST";
		apiKey?: string;
		timeoutMs: number;
		body?: unknown;
	}): Promise<T> {
		const controller = new AbortController();
		const timeout = setTimeout(() => {
			controller.abort();
		}, options.timeoutMs);

		try {
			const response = await fetch(`${options.baseUrl}${options.path}`, {
				method: options.method,
				headers: {
					"Content-Type": "application/json",
					...(options.apiKey
						? {
								Authorization: `Bearer ${options.apiKey}`,
							}
						: {}),
				},
				body: options.body ? JSON.stringify(options.body) : undefined,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Agent provider request failed: ${response.status} ${response.statusText}`);
			}

			return (await response.json()) as T;
		} finally {
			clearTimeout(timeout);
		}
	}

	private normalizeKind(kind: ModelKind): AgentModel["kind"] {
		if (kind === ModelKind.MODEL_KIND_CHAT) return "chat";
		if (kind === ModelKind.MODEL_KIND_EMBED) return "embed";
		return "unknown";
	}
}

function cosineSimilarity(left: number[], right: number[]): number {
	if (left.length === 0 || right.length === 0 || left.length !== right.length) {
		return 0;
	}

	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < left.length; index += 1) {
		const leftValue = left[index] ?? 0;
		const rightValue = right[index] ?? 0;
		dot += leftValue * rightValue;
		leftNorm += leftValue * leftValue;
		rightNorm += rightValue * rightValue;
	}

	if (leftNorm === 0 || rightNorm === 0) {
		return 0;
	}

	return dot / Math.sqrt(leftNorm * rightNorm);
}
