import {
	AGENT_CONFIG_SETTINGS_KEY,
	type AgentModelCapabilities,
	type AgentRuntimeConfig,
	type AgentWorkspaceRuntimeConfig,
	DEFAULT_AGENT_RUNTIME_CONFIG,
	normalizeAgentRuntimeConfig,
	normalizeModelCapabilitiesMap,
	normalizeOptionalString,
	normalizeWorkspaceRuntimeConfig,
	resolveEffectiveWorkspaceAgentConfig,
} from "@app/lib/agent-config";
import { useSetSettingMutation, useSettingQuery } from "@app/queries/settings";
import { api } from "@app/store/api";
import { useCallback, useEffect, useMemo, useState } from "react";

export type WorkspaceCapabilityRow = {
	modelName: string;
	caps: AgentModelCapabilities;
};

export function useWorkspaceAgentSettings(spaceId: string | undefined) {
	const { data: rawConfig } = useSettingQuery(AGENT_CONFIG_SETTINGS_KEY);
	const { mutateAsync, isLoading: isSaving } = useSetSettingMutation();
	const { data: models } = api.useListAgentModelsQuery(spaceId, {
		refetchOnMountOrArgChange: false,
	});
	const [workspaceDraft, setWorkspaceDraft] = useState<AgentWorkspaceRuntimeConfig>(() => ({}));
	const [newCapabilityModel, setNewCapabilityModel] = useState("");
	const normalizedConfig = useMemo(() => normalizeAgentRuntimeConfig(rawConfig), [rawConfig]);
	const effectiveConfig = useMemo(
		() => resolveEffectiveWorkspaceAgentConfig(normalizedConfig, spaceId),
		[normalizedConfig, spaceId],
	);

	useEffect(() => {
		const workspaceValue = spaceId ? normalizedConfig.workspaces[spaceId] : undefined;
		setWorkspaceDraft(workspaceValue ? { ...workspaceValue } : {});
	}, [normalizedConfig, spaceId]);

	const capabilityModels = useMemo(() => {
		const names = new Set<string>();
		for (const model of models ?? []) names.add(model.name);
		for (const modelName of Object.keys(effectiveConfig.modelCapabilities)) names.add(modelName);
		for (const modelName of Object.keys(workspaceDraft.modelCapabilities ?? {})) names.add(modelName);
		return Array.from(names).sort((left, right) => left.localeCompare(right));
	}, [models, effectiveConfig.modelCapabilities, workspaceDraft.modelCapabilities]);

	const capabilityRows = useMemo<WorkspaceCapabilityRow[]>(
		() =>
			capabilityModels.map((modelName) => ({
				modelName,
				caps: workspaceDraft.modelCapabilities?.[modelName] ?? {},
			})),
		[capabilityModels, workspaceDraft.modelCapabilities],
	);

	const updateCapability = useCallback((
		modelName: string,
		key: keyof Omit<AgentModelCapabilities, "updatedAtMs">,
		value: boolean,
	) => {
		const normalizedName = normalizeOptionalString(modelName);
		if (!normalizedName) return;
		setWorkspaceDraft((prev) => ({
			...prev,
			modelCapabilities: {
				...(prev.modelCapabilities ?? {}),
				[normalizedName]: {
					...(prev.modelCapabilities?.[normalizedName] ?? {}),
					[key]: value,
					updatedAtMs: Date.now(),
				},
			},
		}));
	}, []);

	const addCapabilityModel = useCallback(() => {
		const modelName = normalizeOptionalString(newCapabilityModel);
		if (!modelName) return;
		setWorkspaceDraft((prev) => ({
			...prev,
			modelCapabilities: {
				...(prev.modelCapabilities ?? {}),
				[modelName]: prev.modelCapabilities?.[modelName] ?? {
					chat: true,
					updatedAtMs: Date.now(),
				},
			},
		}));
		setNewCapabilityModel("");
	}, [newCapabilityModel]);

	const removeCapabilityModel = useCallback((modelName: string) => {
		setWorkspaceDraft((prev) => {
			const nextCaps = { ...(prev.modelCapabilities ?? {}) };
			delete nextCaps[modelName];
			return { ...prev, modelCapabilities: nextCaps };
		});
	}, []);

	const persist = useCallback(async () => {
		if (!spaceId) return;
		const baseConfig: AgentRuntimeConfig = normalizeAgentRuntimeConfig(rawConfig);
		const normalizedWorkspace = normalizeWorkspaceRuntimeConfig({
			...workspaceDraft,
			modelCapabilities: normalizeModelCapabilitiesMap(workspaceDraft.modelCapabilities),
		});
		const nextWorkspaces = { ...baseConfig.workspaces };
		if (normalizedWorkspace) nextWorkspaces[spaceId] = normalizedWorkspace;
		else delete nextWorkspaces[spaceId];
		await mutateAsync({
			key: AGENT_CONFIG_SETTINGS_KEY,
			value: normalizeAgentRuntimeConfig({ ...baseConfig, workspaces: nextWorkspaces }),
		});
	}, [mutateAsync, rawConfig, spaceId, workspaceDraft]);

	return {
		addCapabilityModel,
		capabilityRows,
		effectiveConfig,
		isSaving,
		newCapabilityModel,
		persist,
		removeCapabilityModel,
		setNewCapabilityModel,
		setWorkspaceDraft,
		updateCapability,
		workspaceDraft,
	};
}

export { DEFAULT_AGENT_RUNTIME_CONFIG };
export type { AgentModelCapabilities, AgentWorkspaceRuntimeConfig };
