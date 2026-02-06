export const AGENT_CONFIG_SETTINGS_KEY = "agent.config";

export type AgentProvider = "agentd" | "openai-compatible" | "llama-cpp";

export type AgentRuntimeConfig = {
	provider: AgentProvider;
	openAiBaseUrl: string;
	openAiApiKey?: string;
	openAiChatModel: string;
	openAiEmbedModel: string;
	llamaCppBaseUrl: string;
	llamaCppChatModel: string;
	pollIntervalMs: number;
	requestTimeoutMs: number;
};

export const DEFAULT_AGENT_RUNTIME_CONFIG: AgentRuntimeConfig = {
	provider: "openai-compatible",
	openAiBaseUrl: "http://127.0.0.1:11434/v1",
	openAiApiKey: "",
	openAiChatModel: "llama3.2",
	openAiEmbedModel: "nomic-embed-text",
	llamaCppBaseUrl: "http://127.0.0.1:8080",
	llamaCppChatModel: "llama-cpp",
	pollIntervalMs: 5_000,
	requestTimeoutMs: 30_000,
};

export function normalizeAgentRuntimeConfig(value: unknown): AgentRuntimeConfig {
	if (!value || typeof value !== "object") {
		return {
			...DEFAULT_AGENT_RUNTIME_CONFIG,
		};
	}

	const maybe = value as Partial<AgentRuntimeConfig>;
	const provider = normalizeProvider(maybe.provider);

	return {
		provider,
		openAiBaseUrl: normalizeUrl(maybe.openAiBaseUrl, DEFAULT_AGENT_RUNTIME_CONFIG.openAiBaseUrl),
		openAiApiKey: typeof maybe.openAiApiKey === "string" ? maybe.openAiApiKey.trim() : "",
		openAiChatModel: normalizeString(maybe.openAiChatModel, DEFAULT_AGENT_RUNTIME_CONFIG.openAiChatModel),
		openAiEmbedModel: normalizeString(maybe.openAiEmbedModel, DEFAULT_AGENT_RUNTIME_CONFIG.openAiEmbedModel),
		llamaCppBaseUrl: normalizeUrl(maybe.llamaCppBaseUrl, DEFAULT_AGENT_RUNTIME_CONFIG.llamaCppBaseUrl),
		llamaCppChatModel: normalizeString(maybe.llamaCppChatModel, DEFAULT_AGENT_RUNTIME_CONFIG.llamaCppChatModel),
		pollIntervalMs: normalizeInteger(
			maybe.pollIntervalMs,
			DEFAULT_AGENT_RUNTIME_CONFIG.pollIntervalMs,
			1_000,
			120_000,
		),
		requestTimeoutMs: normalizeInteger(
			maybe.requestTimeoutMs,
			DEFAULT_AGENT_RUNTIME_CONFIG.requestTimeoutMs,
			3_000,
			120_000,
		),
	};
}

function normalizeProvider(provider: unknown): AgentProvider {
	if (provider === "agentd" || provider === "openai-compatible" || provider === "llama-cpp") {
		return provider;
	}
	return DEFAULT_AGENT_RUNTIME_CONFIG.provider;
}

function normalizeString(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : fallback;
}

function normalizeUrl(value: unknown, fallback: string): string {
	const normalized = normalizeString(value, fallback);
	return normalized.replace(/\/+$/, "");
}

function normalizeInteger(
	value: unknown,
	fallback: number,
	minValue: number,
	maxValue: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const normalized = Math.round(value);
	if (normalized < minValue) return minValue;
	if (normalized > maxValue) return maxValue;
	return normalized;
}
