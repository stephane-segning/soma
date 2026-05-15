import type { AgentModelCapabilities, AgentProvider, AgentWorkspaceRuntimeConfig } from "../agent-config";

export function normalizeProvider(provider: unknown, fallback: AgentProvider): AgentProvider {
	if (provider === "agentd" || provider === "openai-compatible") {
		return provider;
	}
	return fallback;
}

export function normalizeString(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : fallback;
}

export function normalizeUrl(value: unknown, fallback: string): string {
	const normalized = normalizeString(value, fallback);
	return normalized.replace(/\/+$/, "");
}

export function normalizeInteger(value: unknown, fallback: number, minValue: number, maxValue: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	const normalized = Math.round(value);
	if (normalized < minValue) return minValue;
	if (normalized > maxValue) return maxValue;
	return normalized;
}

export function normalizeWorkspaceConfigMap(value: unknown): Record<string, AgentWorkspaceRuntimeConfig> {
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

export function normalizeModelCapabilitiesMap(value: unknown): Record<string, AgentModelCapabilities> {
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
