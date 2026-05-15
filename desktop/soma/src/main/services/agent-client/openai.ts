import type { ResolvedWorkspaceAgentConfig } from "../agent-config";
import type { AgentModel, ChatMessage, ChatOptions, RerankParams, RerankResult, StreamEvent } from "./types";

export async function chatStreamViaOpenAi(
	messages: ChatMessage[],
	options: ChatOptions,
	config: ResolvedWorkspaceAgentConfig,
): Promise<StreamEvent> {
	const model = options.model?.trim() || config.chatModel;
	const response = await requestJson<{
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

export async function listModelsViaOpenAi(config: ResolvedWorkspaceAgentConfig): Promise<AgentModel[]> {
	const response = await requestJson<{
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

export async function rerankViaOpenAi(
	params: RerankParams,
	config: ResolvedWorkspaceAgentConfig,
): Promise<RerankResult[]> {
	const model = params.model?.trim() || config.embedModel;
	const texts = [params.query, ...params.candidates.map((candidate) => candidate.content)];
	const embeddings = await fetchEmbeddings(config, model, texts);
	const queryEmbedding = embeddings[0];
	if (!queryEmbedding) throw new Error("missing query embedding");

	const scored = params.candidates.flatMap((candidate, index) => {
		const embedding = embeddings[index + 1];
		if (!embedding) return [];
		return [{ id: candidate.id, score: cosineSimilarity(queryEmbedding, embedding), rank: 0 }];
	});

	scored.sort((left, right) => right.score - left.score);
	const topN = params.topN && params.topN > 0 ? params.topN : scored.length;
	return scored.slice(0, topN).map((result, index) => ({
		...result,
		rank: index + 1,
	}));
}

async function fetchEmbeddings(
	config: ResolvedWorkspaceAgentConfig,
	model: string,
	texts: string[],
): Promise<Array<number[] | undefined>> {
	const response = await requestJson<{
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
	return embeddings;
}

async function requestJson<T>(options: {
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
				...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
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

function cosineSimilarity(left: number[], right: number[]): number {
	if (left.length === 0 || right.length === 0 || left.length !== right.length) return 0;
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
	if (leftNorm === 0 || rightNorm === 0) return 0;
	return dot / Math.sqrt(leftNorm * rightNorm);
}
