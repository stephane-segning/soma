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

function normalizeProvider(provider: unknown): AgentProvider {
	if (provider === "openai-compatible") {
		return provider;
	}
	return DEFAULT_AGENT_RUNTIME_CONFIG.provider;
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

function normalizeString(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : fallback;
}

function normalizeUrl(value: unknown, fallback: string): string {
	const normalized = normalizeString(value, fallback);
	return normalized.replace(/\/+$/, "");
}

function normalizeInteger(value: unknown, fallback: number, minValue: number, maxValue: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const normalized = Math.round(value);
	if (normalized < minValue) return minValue;
	if (normalized > maxValue) return maxValue;
	return normalized;
}

function normalizeWorkspaceConfigMap(value: unknown): Record<string, AgentWorkspaceRuntimeConfig> {
	if (!value || typeof value !== "object") return {};
	const output: Record<string, AgentWorkspaceRuntimeConfig> = {};

	for (const [rawSpaceId, rawConfig] of Object.entries(value as Record<string, unknown>)) {
		const spaceId = rawSpaceId.trim();
		if (!spaceId) continue;
		const normalized = normalizeWorkspaceConfig(rawConfig);
		if (!normalized) continue;
		output[spaceId] = normalized;
	}

	return output;
}

function normalizeWorkspaceConfig(value: unknown): AgentWorkspaceRuntimeConfig | null {
	if (!value || typeof value !== "object") return null;
	const maybe = value as Partial<AgentWorkspaceRuntimeConfig>;
	const chatModel = typeof maybe.chatModel === "string" ? maybe.chatModel.trim() : "";
	const embedModel = typeof maybe.embedModel === "string" ? maybe.embedModel.trim() : "";
	const modelCapabilities = normalizeModelCapabilitiesMap(maybe.modelCapabilities);
	if (!chatModel && !embedModel && Object.keys(modelCapabilities).length === 0) {
		return null;
	}

	return {
		chatModel: chatModel || undefined,
		embedModel: embedModel || undefined,
		modelCapabilities,
	};
}

function normalizeModelCapabilitiesMap(value: unknown): Record<string, AgentModelCapabilities> {
	if (!value || typeof value !== "object") return {};
	const output: Record<string, AgentModelCapabilities> = {};

	for (const [rawModelName, rawCapabilities] of Object.entries(value as Record<string, unknown>)) {
		const modelName = rawModelName.trim();
		if (!modelName) continue;
		const capabilities = normalizeModelCapabilities(rawCapabilities);
		if (!capabilities) continue;
		output[modelName] = capabilities;
	}

	return output;
}

function normalizeModelCapabilities(value: unknown): AgentModelCapabilities | null {
	if (!value || typeof value !== "object") return null;
	const maybe = value as Partial<AgentModelCapabilities>;

	const chat = typeof maybe.chat === "boolean" ? maybe.chat : undefined;
	const embed = typeof maybe.embed === "boolean" ? maybe.embed : undefined;
	const tool = typeof maybe.tool === "boolean" ? maybe.tool : undefined;
	const image = typeof maybe.image === "boolean" ? maybe.image : undefined;
	const updatedAtMs =
		typeof maybe.updatedAtMs === "number" && Number.isFinite(maybe.updatedAtMs) && maybe.updatedAtMs >= 0
			? Math.floor(maybe.updatedAtMs)
			: undefined;

	if (
		typeof chat === "undefined" &&
		typeof embed === "undefined" &&
		typeof tool === "undefined" &&
		typeof image === "undefined" &&
		typeof updatedAtMs === "undefined"
	) {
		return null;
	}

	return {
		chat,
		embed,
		tool,
		image,
		updatedAtMs,
	};
}
