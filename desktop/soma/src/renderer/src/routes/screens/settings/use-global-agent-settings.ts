import {
	AGENT_CONFIG_SETTINGS_KEY,
	type AgentModelCapabilities,
	type AgentProvider,
	type AgentRuntimeConfig,
	DEFAULT_AGENT_RUNTIME_CONFIG,
	normalizeAgentRuntimeConfig,
	normalizeModelCapabilitiesMap,
	normalizeOptionalString,
} from "@app/lib/agent-config";
import { useSetSettingMutation, useSettingQuery } from "@app/queries/settings";
import { api } from "@app/store/api";
import { useCallback, useEffect, useMemo, useState } from "react";

export type GlobalCapabilityRow = {
	modelName: string;
	caps: AgentModelCapabilities;
};

export function useGlobalAgentSettings() {
	const { data: rawConfig } = useSettingQuery(AGENT_CONFIG_SETTINGS_KEY);
	const { mutateAsync, isLoading: isSaving } = useSetSettingMutation();
	const { data: models } = api.useListAgentModelsQuery(undefined, {
		refetchOnMountOrArgChange: false,
	});
	const [draft, setDraft] = useState<AgentRuntimeConfig>(() => ({
		...DEFAULT_AGENT_RUNTIME_CONFIG,
	}));
	const [newCapabilityModel, setNewCapabilityModel] = useState("");

	useEffect(() => {
		setDraft(normalizeAgentRuntimeConfig(rawConfig));
	}, [rawConfig]);

	const capabilityModels = useMemo(() => {
		const names = new Set<string>();
		for (const model of models ?? []) names.add(model.name);
		for (const modelName of Object.keys(draft.modelCapabilities)) names.add(modelName);
		return Array.from(names).sort((left, right) => left.localeCompare(right));
	}, [draft.modelCapabilities, models]);

	const capabilityRows = useMemo<GlobalCapabilityRow[]>(
		() =>
			capabilityModels.map((modelName) => ({
				modelName,
				caps: draft.modelCapabilities[modelName] ?? {},
			})),
		[capabilityModels, draft.modelCapabilities],
	);

	const persist = useCallback(async () => {
		await mutateAsync({
			key: AGENT_CONFIG_SETTINGS_KEY,
			value: normalizeAgentRuntimeConfig(draft),
		});
	}, [draft, mutateAsync]);

	const updateCapability = useCallback((
		modelName: string,
		key: keyof Omit<AgentModelCapabilities, "updatedAtMs">,
		value: boolean,
	) => {
		const normalizedName = normalizeOptionalString(modelName);
		if (!normalizedName) return;
		setDraft((prev) => ({
			...prev,
			modelCapabilities: {
				...prev.modelCapabilities,
				[normalizedName]: {
					...(prev.modelCapabilities[normalizedName] ?? {}),
					[key]: value,
					updatedAtMs: Date.now(),
				},
			},
		}));
	}, []);

	const removeCapabilityModel = useCallback((modelName: string) => {
		setDraft((prev) => {
			const next = { ...prev.modelCapabilities };
			delete next[modelName];
			return { ...prev, modelCapabilities: next };
		});
	}, []);

	const addCapabilityModel = useCallback(() => {
		const modelName = normalizeOptionalString(newCapabilityModel);
		if (!modelName) return;
		setDraft((prev) => ({
			...prev,
			modelCapabilities: {
				...prev.modelCapabilities,
				[modelName]: prev.modelCapabilities[modelName] ?? {
					chat: true,
					updatedAtMs: Date.now(),
				},
			},
		}));
		setNewCapabilityModel("");
	}, [newCapabilityModel]);

	const normalizeCapabilities = useCallback(() => {
		setDraft((prev) => ({
			...prev,
			modelCapabilities: normalizeModelCapabilitiesMap(prev.modelCapabilities),
		}));
	}, []);

	return {
		addCapabilityModel,
		capabilityRows,
		draft,
		isSaving,
		newCapabilityModel,
		normalizeCapabilities,
		persist,
		removeCapabilityModel,
		setDraft,
		setNewCapabilityModel,
		updateCapability,
	};
}

export type { AgentModelCapabilities, AgentProvider, AgentRuntimeConfig };
