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
import {
	useDecideJoinMutation,
	useJoinRequestsQuery,
	useRevokeMembershipMutation,
	useSpaceMembersQuery,
	useSpaceQuery,
} from "@app/queries/spaces";
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
	const spaceQuery = useSpaceQuery(spaceId ?? "");
	const joinRequestsQuery = useJoinRequestsQuery();
	const membersQuery = useSpaceMembersQuery(spaceId ?? "");
	const { mutateAsync: decideJoinAsync, isLoading: isDecidingJoin } = useDecideJoinMutation();
	const { mutateAsync: revokeMembershipAsync, isLoading: isRevokingMembership } = useRevokeMembershipMutation();
	const [workspaceDraft, setWorkspaceDraft] = useState<AgentWorkspaceRuntimeConfig>(() => ({}));
	const [newCapabilityModel, setNewCapabilityModel] = useState("");
	const [spaceOpsMessage, setSpaceOpsMessage] = useState<string | null>(null);
	const [decisionRoleByRequest, setDecisionRoleByRequest] = useState<Record<string, string>>({});
	const [decisionReasonByRequest, setDecisionReasonByRequest] = useState<Record<string, string>>({});

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

	const pendingJoinRequests = useMemo(() => {
		if (!spaceId) return [];
		return (joinRequestsQuery.data ?? []).filter((request) => request.spaceId === spaceId);
	}, [joinRequestsQuery.data, spaceId]);

	const formatEpoch = (value: number): string => {
		if (!value || value <= 0) return "Unknown";
		const millis = value > 10_000_000_000 ? value : value * 1000;
		const date = new Date(millis);
		if (Number.isNaN(date.getTime())) return "Unknown";
		return date.toLocaleString();
	};

	const requestedRoleLabel = (role: number): string => {
		switch (role) {
			case 1:
				return "owner";
			case 2:
				return "editor";
			case 3:
				return "viewer";
			case 4:
				return "student";
			case 5:
				return "bot";
			default:
				return "unspecified";
		}
	};

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

	const decideJoinRequest = async (requestId: string, approve: boolean) => {
		try {
			const role = decisionRoleByRequest[requestId]?.trim();
			const reason = decisionReasonByRequest[requestId]?.trim();
			const result = await decideJoinAsync({
				requestId,
				approve,
				role: role || undefined,
				reason: reason || undefined,
			});
			setSpaceOpsMessage(
				approve
					? `Join request ${requestId} approved${result?.subjectPeerId ? ` for ${result.subjectPeerId}` : ""}.`
					: `Join request ${requestId} rejected.`,
			);
			setDecisionRoleByRequest((prev) => {
				const next = { ...prev };
				delete next[requestId];
				return next;
			});
			setDecisionReasonByRequest((prev) => {
				const next = { ...prev };
				delete next[requestId];
				return next;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setSpaceOpsMessage(`Failed to decide join request: ${message}`);
		}
	};

	const revokeMember = async (subjectPeerId: string) => {
		if (!spaceId) return;
		try {
			const accepted = await revokeMembershipAsync({
				spaceId,
				subjectPeerId,
				reason: "revoked from space settings",
			});
			setSpaceOpsMessage(accepted ? `Revoked ${subjectPeerId}.` : `No membership was revoked for ${subjectPeerId}.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setSpaceOpsMessage(`Failed to revoke member: ${message}`);
		}
	};

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">{t("space.settings.title", "Space settings")}</h2>
			<p className="text-base-content/70 text-sm">
				Space: {spaceQuery.data?.displayName?.trim() || spaceId || "Unknown"}
				{spaceId ? <span className="ml-2 font-mono text-base-content/60 text-xs">({spaceId})</span> : null}
			</p>

			{spaceOpsMessage ? <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{spaceOpsMessage}</div> : null}

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-3">
					<h3 className="card-title text-base">Join approvals</h3>
					<p className="text-base-content/70 text-sm">Review pending join requests for this space.</p>
					<div className="overflow-x-auto rounded-lg border border-base-300">
						<table className="table-zebra table-sm table">
							<thead>
								<tr>
									<th>Peer</th>
									<th>Requested role</th>
									<th>Requested at</th>
									<th>Role override</th>
									<th>Reason</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{pendingJoinRequests.map((request) => (
									<tr key={request.requestId}>
										<td>
											<div className="font-mono text-xs">{request.subjectPeerId}</div>
											{request.displayName ? (
												<div className="text-base-content/60 text-xs">{request.displayName}</div>
											) : null}
										</td>
										<td className="uppercase">{requestedRoleLabel(request.requestedRole)}</td>
										<td>{formatEpoch(request.createdAt)}</td>
										<td>
											<select
												className="select select-bordered select-xs w-full min-w-28"
												onChange={(event) =>
													setDecisionRoleByRequest((prev) => ({
														...prev,
														[request.requestId]: event.target.value,
													}))
												}
												value={decisionRoleByRequest[request.requestId] ?? ""}
											>
												<option value="">requested/default</option>
												<option value="owner">owner</option>
												<option value="editor">editor</option>
												<option value="viewer">viewer</option>
												<option value="student">student</option>
												<option value="bot">bot</option>
											</select>
										</td>
										<td>
											<input
												className="input input-bordered input-xs w-full min-w-32"
												onChange={(event) =>
													setDecisionReasonByRequest((prev) => ({
														...prev,
														[request.requestId]: event.target.value,
													}))
												}
												placeholder="Optional reason"
												value={decisionReasonByRequest[request.requestId] ?? ""}
											/>
										</td>
										<td className="space-x-1 whitespace-nowrap text-right">
											<button
												className="btn btn-success btn-outline btn-xs"
												disabled={isDecidingJoin}
												onClick={() => void decideJoinRequest(request.requestId, true)}
												type="button"
											>
												Approve
											</button>
											<button
												className="btn btn-error btn-outline btn-xs"
												disabled={isDecidingJoin}
												onClick={() => void decideJoinRequest(request.requestId, false)}
												type="button"
											>
												Reject
											</button>
										</td>
									</tr>
								))}
								{joinRequestsQuery.isLoading && (
									<tr>
										<td className="text-base-content/70" colSpan={6}>
											Loading join requests...
										</td>
									</tr>
								)}
								{!joinRequestsQuery.isLoading && pendingJoinRequests.length === 0 && (
									<tr>
										<td className="text-base-content/70" colSpan={6}>
											No pending requests for this space.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-3">
					<h3 className="card-title text-base">Member board</h3>
					<p className="text-base-content/70 text-sm">Current memberships and revoke action for this space.</p>
					<div className="overflow-x-auto rounded-lg border border-base-300">
						<table className="table-zebra table-sm table">
							<thead>
								<tr>
									<th>Peer</th>
									<th>Role</th>
									<th>Expiry</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{(membersQuery.data ?? []).map((member) => (
									<tr key={`${member.spaceId}:${member.peerId}`}>
										<td className="font-mono text-xs">{member.peerId}</td>
										<td className="uppercase">{member.role || "unspecified"}</td>
										<td>{member.expiresAt > 0 ? formatEpoch(member.expiresAt) : "No expiry"}</td>
										<td className="text-right">
											<button
												className="btn btn-error btn-outline btn-xs"
												disabled={isRevokingMembership}
												onClick={() => void revokeMember(member.peerId)}
												type="button"
											>
												Revoke
											</button>
										</td>
									</tr>
								))}
								{membersQuery.isLoading && (
									<tr>
										<td className="text-base-content/70" colSpan={4}>
											Loading members...
										</td>
									</tr>
								)}
								{!membersQuery.isLoading && (membersQuery.data?.length ?? 0) === 0 && (
									<tr>
										<td className="text-base-content/70" colSpan={4}>
											No members found for this space.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>

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
						<table className="table-zebra table-sm table">
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
						<button className="btn btn-outline btn-sm" onClick={() => setWorkspaceDraft({})} type="button">
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
