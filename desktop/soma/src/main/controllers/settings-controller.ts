import {
	AGENT_CONFIG_SETTINGS_KEY,
	type AgentRuntimeConfig,
	normalizeAgentRuntimeConfig,
} from "../services/agent-config";
import type { AppDataStore } from "../services/app-data-store";

export class SettingsController {
	constructor(private readonly store: AppDataStore) {}

	get<T>(key: string): T | null {
		if (key === AGENT_CONFIG_SETTINGS_KEY) {
			const value = this.store.settings[key];
			return normalizeAgentRuntimeConfig(value) as T;
		}
		const value = this.store.settings[key];
		return (value ?? null) as T | null;
	}

	set(key: string, value: unknown): void {
		const normalized =
			key === AGENT_CONFIG_SETTINGS_KEY ? (normalizeAgentRuntimeConfig(value) as AgentRuntimeConfig) : value;
		const next = {
			...this.store.settings,
			[key]: normalized,
		};
		this.store.settings = next;
	}
}
