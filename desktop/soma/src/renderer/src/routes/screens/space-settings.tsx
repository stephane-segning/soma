import {
	AGENT_CONFIG_SETTINGS_KEY,
	DEFAULT_AGENT_RUNTIME_CONFIG,
	type AgentModelCapabilities,
	type AgentRuntimeConfig,
	type AgentWorkspaceRuntimeConfig,
	normalizeAgentRuntimeConfig,
	normalizeModelCapabilitiesMap,
	normalizeOptionalString,
	normalizeWorkspaceRuntimeConfig,
	resolveEffectiveWorkspaceAgentConfig,
} from "@app/lib/agent-config";
import { useSetSettingMutation, useSettingQuery } from "@app/queries/settings";
import { api } from "@app/store/api";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { spaceId } = useParams<{ spaceId: string }>();
	const { data: rawConfig } = useSettingQuery(AGENT_CONFIG_SETTINGS_KEY);
	const { mutateAsync, isLoading: isSaving } = useSetSettingMutation();
	const { data: models } = api.useListAgentModelsQuery(spaceId, {
		refetchOnMountOrArgChange: false,
	});
	const [workspaceDraft, setWorkspaceDraft] = useState<AgentWorkspaceRuntimeConfig>(() => ({}));
	const [newCapabilityModel, setNewCapabilityModel] = useState("");

	const normalizedConfig = useMemo(
		() => normalizeAgentRuntimeConfig(rawConfig),
		[rawConfig],
	);
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

	const updateCapability = (
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
	};

	const addCapabilityModel = () => {
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
	};

	const removeCapabilityModel = (modelName: string) => {
		setWorkspaceDraft((prev) => {
			const nextCaps = {
				...(prev.modelCapabilities ?? {}),
			};
			delete nextCaps[modelName];
			return {
				...prev,
				modelCapabilities: nextCaps,
			};
		});
	};

	const persist = async () => {
		if (!spaceId) return;
		const baseConfig: AgentRuntimeConfig = normalizeAgentRuntimeConfig(rawConfig);
		const normalizedWorkspace = normalizeWorkspaceRuntimeConfig({
			...workspaceDraft,
			modelCapabilities: normalizeModelCapabilitiesMap(workspaceDraft.modelCapabilities),
		});
		const nextWorkspaces = {
			...baseConfig.workspaces,
		};
		if (normalizedWorkspace) {
			nextWorkspaces[spaceId] = normalizedWorkspace;
		} else {
			delete nextWorkspaces[spaceId];
		}
		await mutateAsync({
			key: AGENT_CONFIG_SETTINGS_KEY,
			value: normalizeAgentRuntimeConfig({
				...baseConfig,
				workspaces: nextWorkspaces,
			}),
		});
	};

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">{t("space.settings.title", "Space settings")}</h2>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<label className="form-control w-full">
					<span className="label-text">Workspace chat model override</span>
					<input
						className="input input-bordered w-full"
						onChange={(event) =>
							setWorkspaceDraft((prev) => ({
								...prev,
								chatModel: event.target.value,
							}))
						}
						placeholder={effectiveConfig.chatModel || DEFAULT_AGENT_RUNTIME_CONFIG.openAiChatModel}
						value={workspaceDraft.chatModel ?? ""}
					/>
				</label>
				<label className="form-control w-full">
					<span className="label-text">Workspace embed model override</span>
					<input
						className="input input-bordered w-full"
						onChange={(event) =>
							setWorkspaceDraft((prev) => ({
								...prev,
								embedModel: event.target.value,
							}))
						}
						placeholder={effectiveConfig.embedModel || DEFAULT_AGENT_RUNTIME_CONFIG.openAiEmbedModel}
						value={workspaceDraft.embedModel ?? ""}
					/>
				</label>
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body">
					<h3 className="card-title text-base">Workspace model capabilities</h3>
					<p className="text-base-content/70 text-sm">
						Per-workspace capability overrides stay local in electron-store and never sync to daemon.
					</p>
					<div className="overflow-x-auto rounded-lg border border-base-300">
						<table className="table table-zebra table-sm">
							<thead>
								<tr>
									<th>Model</th>
									<th>Chat</th>
									<th>Embed</th>
									<th>Tool</th>
									<th>Image</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{capabilityModels.map((modelName) => {
									const caps = workspaceDraft.modelCapabilities?.[modelName] ?? {};
									return (
										<tr key={modelName}>
											<td className="font-medium">{modelName}</td>
											<td>
												<input
													checked={caps.chat === true}
													className="checkbox checkbox-sm"
													onChange={(event) => updateCapability(modelName, "chat", event.target.checked)}
													type="checkbox"
												/>
											</td>
											<td>
												<input
													checked={caps.embed === true}
													className="checkbox checkbox-sm"
													onChange={(event) => updateCapability(modelName, "embed", event.target.checked)}
													type="checkbox"
												/>
											</td>
											<td>
												<input
													checked={caps.tool === true}
													className="checkbox checkbox-sm"
													onChange={(event) => updateCapability(modelName, "tool", event.target.checked)}
													type="checkbox"
												/>
											</td>
											<td>
												<input
													checked={caps.image === true}
													className="checkbox checkbox-sm"
													onChange={(event) => updateCapability(modelName, "image", event.target.checked)}
													type="checkbox"
												/>
											</td>
											<td>
												<button
													className="btn btn-ghost btn-xs"
													onClick={() => removeCapabilityModel(modelName)}
													type="button"
												>
													Remove
												</button>
											</td>
										</tr>
									);
								})}
								{capabilityModels.length === 0 && (
									<tr>
										<td className="text-base-content/70" colSpan={6}>
											No workspace capability overrides yet.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<div className="flex items-center gap-2 pt-2">
						<input
							className="input input-bordered input-sm w-full"
							onChange={(event) => setNewCapabilityModel(event.target.value)}
							placeholder="Add model name"
							value={newCapabilityModel}
						/>
						<button className="btn btn-sm" onClick={addCapabilityModel} type="button">
							Add
						</button>
					</div>
					<div className="flex items-center justify-end gap-2 pt-2">
						<button
							className="btn btn-outline btn-sm"
							onClick={() => setWorkspaceDraft({})}
							type="button"
						>
							Clear workspace overrides
						</button>
						<button
							className="btn btn-primary btn-sm"
							disabled={!spaceId || isSaving}
							onClick={() => void persist()}
							type="button"
						>
							{isSaving ? "Saving..." : "Save workspace settings"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };
