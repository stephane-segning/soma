import {
	normalizeInteger,
	normalizeModelCapabilitiesMap,
	normalizeProvider,
	normalizeString,
	normalizeUrl,
	normalizeWorkspaceConfigMap,
} from "./agent-config/normalizers";

export const AGENT_CONFIG_SETTINGS_KEY = "agent.config";

export type AgentProvider = "openai-compatible";

export type AgentModelCapabilities = {
	chat?: boolean;
	embed?: boolean;
	tool?: boolean;
	image?: boolean;
	updatedAtMs?: number;
};

export type AgentWorkspaceRuntimeConfig = {
	chatModel?: string;
	embedModel?: string;
	modelCapabilities?: Record<string, AgentModelCapabilities>;
};

export type AgentRuntimeConfig = {
	provider: AgentProvider;
	openAiBaseUrl: string;
	openAiApiKey?: string;
	openAiChatModel: string;
	openAiEmbedModel: string;
	pollIntervalMs: number;
	requestTimeoutMs: number;
	modelCapabilities: Record<string, AgentModelCapabilities>;
	workspaces: Record<string, AgentWorkspaceRuntimeConfig>;
};

export const DEFAULT_AGENT_RUNTIME_CONFIG: AgentRuntimeConfig = {
	provider: "openai-compatible",
	openAiBaseUrl: "http://127.0.0.1:11434/v1",
	openAiApiKey: "",
	openAiChatModel: "llama3.2:1b",
	openAiEmbedModel: "nomic-embed-text",
	pollIntervalMs: 5_000,
	requestTimeoutMs: 30_000,
	modelCapabilities: {},
	workspaces: {},
};

export type ResolvedWorkspaceAgentConfig = {
	provider: AgentProvider;
	openAiBaseUrl: string;
	openAiApiKey?: string;
	pollIntervalMs: number;
	requestTimeoutMs: number;
	chatModel: string;
	embedModel: string;
	modelCapabilities: Record<string, AgentModelCapabilities>;
};

export function normalizeAgentRuntimeConfig(value: unknown): AgentRuntimeConfig {
	if (!value || typeof value !== "object") {
		return { ...DEFAULT_AGENT_RUNTIME_CONFIG };
	}

	const maybe = value as Partial<AgentRuntimeConfig>;
	return {
		provider: normalizeProvider(maybe.provider, DEFAULT_AGENT_RUNTIME_CONFIG.provider),
		openAiBaseUrl: normalizeUrl(maybe.openAiBaseUrl, DEFAULT_AGENT_RUNTIME_CONFIG.openAiBaseUrl),
		openAiApiKey: typeof maybe.openAiApiKey === "string" ? maybe.openAiApiKey.trim() : "",
		openAiChatModel: normalizeString(maybe.openAiChatModel, DEFAULT_AGENT_RUNTIME_CONFIG.openAiChatModel),
		openAiEmbedModel: normalizeString(maybe.openAiEmbedModel, DEFAULT_AGENT_RUNTIME_CONFIG.openAiEmbedModel),
		pollIntervalMs: normalizeInteger(maybe.pollIntervalMs, DEFAULT_AGENT_RUNTIME_CONFIG.pollIntervalMs, 1_000, 120_000),
		requestTimeoutMs: normalizeInteger(
			maybe.requestTimeoutMs,
			DEFAULT_AGENT_RUNTIME_CONFIG.requestTimeoutMs,
			3_000,
			120_000,
		),
		modelCapabilities: normalizeModelCapabilitiesMap(maybe.modelCapabilities),
		workspaces: normalizeWorkspaceConfigMap(maybe.workspaces),
	};
}

export function resolveWorkspaceAgentConfig(
	config: AgentRuntimeConfig,
	spaceId?: string | null,
): ResolvedWorkspaceAgentConfig {
	const normalizedSpaceId = typeof spaceId === "string" ? spaceId.trim() : "";
	const workspace = normalizedSpaceId.length > 0 ? config.workspaces[normalizedSpaceId] : undefined;
	const chatModel = normalizeString(workspace?.chatModel, config.openAiChatModel);
	const embedModel = normalizeString(workspace?.embedModel, config.openAiEmbedModel);
	const workspaceCapabilities = normalizeModelCapabilitiesMap(workspace?.modelCapabilities);

	return {
		provider: config.provider,
		openAiBaseUrl: config.openAiBaseUrl,
		openAiApiKey: config.openAiApiKey,
		pollIntervalMs: config.pollIntervalMs,
		requestTimeoutMs: config.requestTimeoutMs,
		chatModel,
		embedModel,
		modelCapabilities: {
			...config.modelCapabilities,
			...workspaceCapabilities,
		},
	};
}
