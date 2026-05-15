import * as grpc from "@grpc/grpc-js";
import { createId } from "@paralleldrive/cuid2";
import { AgentClient as GrpcAgentClient } from "@soma/proto/agent/v1/agent";
import { type AgentProvider, normalizeAgentRuntimeConfig, resolveWorkspaceAgentConfig } from "./agent-config";

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type ChatOptions = {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	spaceId?: string;
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
	spaceId?: string;
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

export type BackgroundTaskKind = "explain-selection" | "expand-selection" | "research-selection";

export type BackgroundTaskStatus = "queued" | "running" | "succeeded" | "failed" | "unknown";

export type BackgroundTask = {
	taskId: string;
	kind: BackgroundTaskKind;
	status: BackgroundTaskStatus;
	spaceId: string;
	documentId: string;
	selectionText: string;
	persistInDocument: boolean;
	resultText: string;
	error: string;
	createdAtMs: number;
	updatedAtMs: number;
};

export type EnqueueBackgroundTaskParams = {
	kind: BackgroundTaskKind;
	spaceId: string;
	documentId: string;
	selectionText: string;
	model?: string;
	persistInDocument?: boolean;
};

export type ListBackgroundTasksParams = {
	spaceId?: string;
	limit?: number;
};

export class AgentClient {
	private client: GrpcAgentClient;
	private readonly readConfig: () => ReturnType<typeof normalizeAgentRuntimeConfig>;
	private readonly backgroundTasks = new Map<string, BackgroundTask>();

	constructor(socketPath: string, readConfig?: () => unknown) {
		const address = `unix://${socketPath}`;
		this.client = new GrpcAgentClient(address, grpc.credentials.createInsecure());
		this.readConfig = () => normalizeAgentRuntimeConfig(readConfig?.());
	}

	async chatStream(messages: ChatMessage[], options: ChatOptions = {}): Promise<StreamEvent> {
		const config = this.resolveRuntimeConfig(options.spaceId);
		try {
			return await this.chatStreamViaOpenAi(messages, options, config);
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async listModels(spaceId?: string): Promise<AgentModel[]> {
		const config = this.resolveRuntimeConfig(spaceId);
		return this.listModelsViaOpenAi(config);
	}

	async rerank(params: RerankParams): Promise<RerankResult[]> {
		const config = this.resolveRuntimeConfig(params.spaceId);
		if (!params.query?.trim()) {
			throw new Error("query is required");
		}
		if (!params.candidates?.length) {
			throw new Error("at least one candidate is required");
		}
		return this.rerankViaOpenAi(params, config);
	}

	async resolveDrift(params: ResolveDriftParams): Promise<ResolveDriftResult> {
		return this.resolveDriftViaAgentd(params);
	}

	async enqueueBackgroundTask(params: EnqueueBackgroundTaskParams): Promise<BackgroundTask> {
		if (!params.spaceId?.trim()) {
			throw new Error("spaceId is required");
		}
		if (!params.documentId?.trim()) {
			throw new Error("documentId is required");
		}
		if (!params.selectionText?.trim()) {
			throw new Error("selectionText is required");
		}

		const now = Date.now();
		const task: BackgroundTask = {
			taskId: createId(),
			kind: params.kind,
			status: "queued",
			spaceId: params.spaceId,
			documentId: params.documentId,
			selectionText: params.selectionText,
			persistInDocument: params.persistInDocument ?? false,
			resultText: "",
			error: "",
			createdAtMs: now,
			updatedAtMs: now,
		};
		this.backgroundTasks.set(task.taskId, task);
		void this.runBackgroundTask(task.taskId, params.model);
		return task;
	}

	async listBackgroundTasks(params: ListBackgroundTasksParams = {}): Promise<BackgroundTask[]> {
		const limit = Math.max(1, params.limit ?? 50);
		return Array.from(this.backgroundTasks.values())
			.filter((task) => !params.spaceId || task.spaceId === params.spaceId)
			.sort((left, right) => right.createdAtMs - left.createdAtMs)
			.slice(0, limit)
			.map((task) => ({ ...task }));
	}

	startEventStream(handlers: AgentRuntimeEventHandlers): () => void {
		let stopped = false;
		let timer: NodeJS.Timeout | null = null;
		let emittedReady = false;

		const run = async () => {
			if (stopped) return;
			const config = this.resolveRuntimeConfig();
			try {
				const models = await this.listModels();
				if (!emittedReady) {
					handlers.onEvent({
						kind: "ready",
						atMs: Date.now(),
						provider: config.provider,
						baseUrl: config.openAiBaseUrl,
					});
					emittedReady = true;
				}
				handlers.onEvent({
					kind: "status",
					atMs: Date.now(),
					provider: config.provider,
					baseUrl: config.openAiBaseUrl,
					models,
				});
			} catch (error) {
				handlers.onEvent({
					kind: "error",
					atMs: Date.now(),
					provider: config.provider,
					baseUrl: config.openAiBaseUrl,
					error: error instanceof Error ? error.message : String(error),
				});
			} finally {
				if (!stopped) {
					timer = setTimeout(run, Math.max(1_000, config.pollIntervalMs));
				}
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

	private async runBackgroundTask(taskId: string, model?: string): Promise<void> {
		const task = this.backgroundTasks.get(taskId);
		if (!task) return;

		this.updateBackgroundTask(taskId, {
			status: "running",
			error: "",
		});

		try {
			const config = this.resolveRuntimeConfig(task.spaceId);
			const response = await this.chatStreamViaOpenAi(
				this.backgroundTaskMessages(task),
				{
					model,
					maxTokens: 1_200,
					temperature: task.kind === "research-selection" ? 0.3 : 0.2,
					spaceId: task.spaceId,
				},
				config,
			);
			if (response.error) {
				throw new Error(response.error);
			}
			this.updateBackgroundTask(taskId, {
				status: "succeeded",
				resultText: (response.token ?? "").trim(),
			});
		} catch (error) {
			this.updateBackgroundTask(taskId, {
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private updateBackgroundTask(taskId: string, patch: Partial<BackgroundTask>): void {
		const task = this.backgroundTasks.get(taskId);
		if (!task) return;
		this.backgroundTasks.set(taskId, {
			...task,
			...patch,
			updatedAtMs: Date.now(),
		});
	}

	private backgroundTaskMessages(task: BackgroundTask): ChatMessage[] {
		const selection = task.selectionText.trim();
		switch (task.kind) {
			case "explain-selection":
				return [
					{
						role: "system",
						content: "Explain the selected text clearly and concisely. Avoid filler.",
					},
					{
						role: "user",
						content: selection,
					},
				];
			case "expand-selection":
				return [
					{
						role: "system",
						content:
							"Expand the selected text into richer, accurate prose that can be inserted directly into the document. Return only the expanded text.",
					},
					{
						role: "user",
						content: selection,
					},
				];
			case "research-selection":
				return [
					{
						role: "system",
						content:
							"Research and synthesize the selected text using the configured model provider. Return concise findings, useful context, and any uncertainty. Do not claim external web access unless the provider actually has it.",
					},
					{
						role: "user",
						content: selection,
					},
				];
		}
	}

	private async chatStreamViaOpenAi(
		messages: ChatMessage[],
		options: ChatOptions,
		config: ReturnType<typeof resolveWorkspaceAgentConfig>,
	): Promise<StreamEvent> {
		const model = options.model?.trim() || config.chatModel;
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

		const content = response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text ?? "";

		return {
			token: content,
			done: true,
		};
	}

	private async listModelsViaOpenAi(config: ReturnType<typeof resolveWorkspaceAgentConfig>): Promise<AgentModel[]> {
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

		const models = (response.data ?? []).map((model) => model.id?.trim() ?? "").filter((model) => model.length > 0);

		return models.map((model) => ({
			name: model,
			kind: "unknown",
			path: config.openAiBaseUrl,
			loaded: true,
		}));
	}

	private async rerankViaOpenAi(
		params: RerankParams,
		config: ReturnType<typeof resolveWorkspaceAgentConfig>,
	): Promise<RerankResult[]> {
		const model = params.model?.trim() || config.embedModel;
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

	private resolveRuntimeConfig(spaceId?: string): ReturnType<typeof resolveWorkspaceAgentConfig> {
		return resolveWorkspaceAgentConfig(this.readConfig(), spaceId);
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
