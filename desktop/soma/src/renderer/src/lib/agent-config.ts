export const AGENT_CONFIG_SETTINGS_KEY = "agent.config";

export type AgentProvider = "agentd" | "openai-compatible";

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
	openAiChatModel: "llama3.2",
	openAiEmbedModel: "nomic-embed-text",
	pollIntervalMs: 5_000,
	requestTimeoutMs: 30_000,
	modelCapabilities: {},
	workspaces: {},
};

export type EffectiveWorkspaceAgentConfig = {
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
	return {
		provider: normalizeProvider(maybe.provider),
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

export function resolveEffectiveWorkspaceAgentConfig(
	config: AgentRuntimeConfig,
	spaceId?: string,
): EffectiveWorkspaceAgentConfig {
	const normalizedSpaceId = normalizeOptionalString(spaceId);
	const workspace = normalizedSpaceId ? config.workspaces[normalizedSpaceId] : undefined;
	const workspaceCapabilities = normalizeModelCapabilitiesMap(workspace?.modelCapabilities);
	return {
		chatModel: normalizeString(workspace?.chatModel, config.openAiChatModel),
		embedModel: normalizeString(workspace?.embedModel, config.openAiEmbedModel),
		modelCapabilities: {
			...config.modelCapabilities,
			...workspaceCapabilities,
		},
	};
}

export function normalizeWorkspaceRuntimeConfig(value: unknown): AgentWorkspaceRuntimeConfig | null {
	if (!value || typeof value !== "object") return null;
	const maybe = value as Partial<AgentWorkspaceRuntimeConfig>;
	const chatModel = normalizeOptionalString(maybe.chatModel);
	const embedModel = normalizeOptionalString(maybe.embedModel);
	const modelCapabilities = normalizeModelCapabilitiesMap(maybe.modelCapabilities);
	if (!chatModel && !embedModel && Object.keys(modelCapabilities).length === 0) {
		return null;
	}
	return {
		chatModel,
		embedModel,
		modelCapabilities,
	};
}

function normalizeProvider(provider: unknown): AgentProvider {
	if (provider === "agentd" || provider === "openai-compatible") {
		return provider;
	}
	return DEFAULT_AGENT_RUNTIME_CONFIG.provider;
}

function normalizeWorkspaceConfigMap(value: unknown): Record<string, AgentWorkspaceRuntimeConfig> {
	if (!value || typeof value !== "object") return {};
	const output: Record<string, AgentWorkspaceRuntimeConfig> = {};
	for (const [rawSpaceId, rawConfig] of Object.entries(value as Record<string, unknown>)) {
		const spaceId = normalizeOptionalString(rawSpaceId);
		if (!spaceId) continue;
		const normalized = normalizeWorkspaceRuntimeConfig(rawConfig);
		if (!normalized) continue;
		output[spaceId] = normalized;
	}
	return output;
}

export function normalizeModelCapabilitiesMap(value: unknown): Record<string, AgentModelCapabilities> {
	if (!value || typeof value !== "object") return {};
	const output: Record<string, AgentModelCapabilities> = {};
	for (const [rawModelName, rawValue] of Object.entries(value as Record<string, unknown>)) {
		const modelName = normalizeOptionalString(rawModelName);
		if (!modelName) continue;
		const caps = normalizeModelCapabilities(rawValue);
		if (!caps) continue;
		output[modelName] = caps;
	}
	return output;
}

export function normalizeModelCapabilities(value: unknown): AgentModelCapabilities | null {
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

export function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

function normalizeString(value: unknown, fallback: string): string {
	return normalizeOptionalString(value) ?? fallback;
}

function normalizeUrl(value: unknown, fallback: string): string {
	return normalizeString(value, fallback).replace(/\/+$/, "");
}

function normalizeInteger(value: unknown, fallback: number, minValue: number, maxValue: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const normalized = Math.round(value);
	if (normalized < minValue) return minValue;
	if (normalized > maxValue) return maxValue;
	return normalized;
}
