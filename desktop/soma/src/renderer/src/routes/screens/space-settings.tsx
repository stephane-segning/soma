import { TanstackTable } from "@app/components/tables/tanstack-table";
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
	type JoinRequestRecord,
	type SpaceMember,
	useDecideJoinMutation,
	useJoinRequestsQuery,
	useRevokeMembershipMutation,
	useSpaceMembersQuery,
	useSpaceQuery,
} from "@app/queries/spaces";
import { api } from "@app/store/api";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { describeRole, formatRoleLabel, membershipSummary, requestedAccessLevelLabel, roleOptions } from "./access-utils";

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

	const formatEpoch = useCallback((value: number): string => {
		if (!value || value <= 0) return "Unknown";
		const millis = value > 10_000_000_000 ? value : value * 1000;
		const date = new Date(millis);
		if (Number.isNaN(date.getTime())) return "Unknown";
		return date.toLocaleString();
	}, []);

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
			const nextCaps = {
				...(prev.modelCapabilities ?? {}),
			};
			delete nextCaps[modelName];
			return {
				...prev,
				modelCapabilities: nextCaps,
			};
		});
	}, []);

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

	const decideJoinRequest = useCallback(async (requestId: string, approve: boolean) => {
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
					? `Approved access${result?.subjectPeerId ? ` for ${result.subjectPeerId}` : ""}${role ? ` as ${formatRoleLabel(role)}` : ""}. If the requester is offline, Soma delivers the decision when they reconnect.`
					: `Rejected access request${result?.subjectPeerId ? ` for ${result.subjectPeerId}` : ""}.`,
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
	}, [decideJoinAsync, decisionReasonByRequest, decisionRoleByRequest]);

	const revokeMember = useCallback(async (subjectPeerId: string) => {
		if (!spaceId) return;
		if (!window.confirm(`Revoke access for ${subjectPeerId}? They will lose their current membership for this workspace.`)) {
			return;
		}
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
	}, [revokeMembershipAsync, spaceId]);
	const memberRows = membersQuery.data ?? [];
	const approvalRoleOptions = useMemo(() => roleOptions(), []);
	const joinApprovalColumns = useMemo<ColumnDef<JoinRequestRecord>[]>(
		() => [
			{
				header: "Requester",
				cell: ({ row }) => (
					<div>
						<div className="font-medium text-sm">{row.original.displayName || row.original.subjectPeerId}</div>
						<div className="font-mono text-xs">{row.original.subjectPeerId}</div>
						{row.original.displayName ? (
							<div className="text-base-content/60 text-xs">{row.original.deviceName || "Unknown device"}</div>
						) : null}
					</div>
				),
			},
			{
				header: "Requested access level",
				cell: ({ row }) => (
					<div className="space-y-1">
						<div className="font-medium text-sm">{requestedAccessLevelLabel(row.original.requestedRole)}</div>
						<div className="max-w-xs text-base-content/60 text-xs">Current desktop requests do not include a role choice, so they usually arrive as Member unless you change it here.</div>
					</div>
				),
			},
			{
				header: "Requested at",
				cell: ({ row }) => formatEpoch(row.original.createdAt),
			},
			{
				header: "Grant as",
				cell: ({ row }) => (
					<select
						className="select select-bordered select-xs w-full min-w-28"
						onChange={(event) =>
							setDecisionRoleByRequest((prev) => ({
								...prev,
								[row.original.requestId]: event.target.value,
							}))
						}
						value={decisionRoleByRequest[row.original.requestId] ?? ""}
					>
						<option value="">requested/default</option>
						{approvalRoleOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				),
			},
			{
				header: "Decision note",
				cell: ({ row }) => (
					<input
						className="input input-bordered input-xs w-full min-w-32"
						onChange={(event) =>
							setDecisionReasonByRequest((prev) => ({
								...prev,
								[row.original.requestId]: event.target.value,
							}))
						}
						placeholder="Optional note"
						value={decisionReasonByRequest[row.original.requestId] ?? ""}
					/>
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="space-x-1 whitespace-nowrap text-right">
						<button
							className="btn btn-success btn-outline btn-xs"
							disabled={isDecidingJoin}
							onClick={() => void decideJoinRequest(row.original.requestId, true)}
							type="button"
						>
							Approve
						</button>
						<button
							className="btn btn-error btn-outline btn-xs"
							disabled={isDecidingJoin}
							onClick={() => void decideJoinRequest(row.original.requestId, false)}
							type="button"
						>
							Reject
						</button>
					</div>
				),
			},
		],
		[
			approvalRoleOptions,
			decisionReasonByRequest,
			decisionRoleByRequest,
			decideJoinRequest,
			formatEpoch,
			isDecidingJoin,
		],
	);
	const memberBoardColumns = useMemo<ColumnDef<SpaceMember>[]>(
		() => [
			{
				header: "Peer",
				cell: ({ row }) => <span className="font-mono text-xs">{row.original.peerId}</span>,
			},
			{
				header: "Role",
				cell: ({ row }) => (
					<div className="space-y-1">
						<div className="font-medium text-sm">{formatRoleLabel(row.original.role || "unspecified")}</div>
						<div className="max-w-xs text-base-content/60 text-xs">{describeRole(row.original.role)}</div>
					</div>
				),
			},
			{
				header: "Expiry",
				cell: ({ row }) => (row.original.expiresAt > 0 ? formatEpoch(row.original.expiresAt) : "No expiry"),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="text-right">
						<button
							className="btn btn-error btn-outline btn-xs"
							disabled={isRevokingMembership}
							onClick={() => void revokeMember(row.original.peerId)}
							type="button"
						>
							Revoke
						</button>
					</div>
				),
			},
		],
		[formatEpoch, isRevokingMembership, revokeMember],
	);
	const workspaceCapabilityRows = useMemo(
		() =>
			capabilityModels.map((modelName) => ({
				modelName,
				caps: workspaceDraft.modelCapabilities?.[modelName] ?? {},
			})),
		[capabilityModels, workspaceDraft.modelCapabilities],
	);
	const workspaceCapabilityColumns = useMemo<
		ColumnDef<{
			modelName: string;
			caps: AgentModelCapabilities;
		}>[]
	>(
		() => [
			{
				header: "Model",
				cell: ({ row }) => <span className="font-medium">{row.original.modelName}</span>,
			},
			{
				header: "Chat",
				cell: ({ row }) => (
					<input
						checked={row.original.caps.chat === true}
						className="checkbox checkbox-sm"
						onChange={(event) => updateCapability(row.original.modelName, "chat", event.target.checked)}
						type="checkbox"
					/>
				),
			},
			{
				header: "Embed",
				cell: ({ row }) => (
					<input
						checked={row.original.caps.embed === true}
						className="checkbox checkbox-sm"
						onChange={(event) => updateCapability(row.original.modelName, "embed", event.target.checked)}
						type="checkbox"
					/>
				),
			},
			{
				header: "Tool",
				cell: ({ row }) => (
					<input
						checked={row.original.caps.tool === true}
						className="checkbox checkbox-sm"
						onChange={(event) => updateCapability(row.original.modelName, "tool", event.target.checked)}
						type="checkbox"
					/>
				),
			},
			{
				header: "Image",
				cell: ({ row }) => (
					<input
						checked={row.original.caps.image === true}
						className="checkbox checkbox-sm"
						onChange={(event) => updateCapability(row.original.modelName, "image", event.target.checked)}
						type="checkbox"
					/>
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<button
						className="btn btn-ghost btn-xs"
						onClick={() => removeCapabilityModel(row.original.modelName)}
						type="button"
					>
						Remove
					</button>
				),
			},
		],
		[removeCapabilityModel, updateCapability],
	);

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">{t("space.settings.title", "Space settings")}</h2>
			<p className="text-base-content/70 text-sm">
				Space: {spaceQuery.data?.displayName?.trim() || spaceId || "Unknown"}
				{spaceId ? <span className="ml-2 font-mono text-base-content/60 text-xs">({spaceId})</span> : null}
			</p>

			{spaceOpsMessage ? <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{spaceOpsMessage}</div> : null}

			<div className="grid gap-3 md:grid-cols-3">
				<div className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
					<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">Members</div>
					<div className="mt-1 font-semibold text-xl">{memberRows.length}</div>
					<div className="text-base-content/70 text-xs">{membershipSummary(memberRows)}</div>
				</div>
				<div className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
					<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">Pending requests</div>
					<div className="mt-1 font-semibold text-xl">{pendingJoinRequests.length}</div>
					<div className="text-base-content/70 text-xs">Approve or reject people waiting for access</div>
				</div>
				<div className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
					<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">Members page</div>
					<div className="mt-1 font-semibold text-base">Read-only roster</div>
					<div className="mt-2">
						<Link className="btn btn-ghost btn-xs" to={`/spaces/${spaceId}/members`}>
							Open members view
						</Link>
					</div>
				</div>
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-3">
					<h3 className="card-title text-base">Access requests</h3>
					<p className="text-base-content/70 text-sm">Review pending access requests and choose the access level this peer should receive.</p>
					<div className="rounded-xl border border-base-300 bg-base-200/50 px-4 py-3 text-xs text-base-content/70">
						Most people should be granted Editor, Viewer, or Member. Use Owner sparingly. Use Bot only for trusted non-human peers.
						<div className="mt-2">Bot membership does not automatically grant join approval authority. Bot actions should stay within caching and serving, organizing and indexing, or approved automation and scripts.</div>
					</div>
					<TanstackTable
						columns={joinApprovalColumns}
						data={pendingJoinRequests}
						emptyMessage="No access requests are currently waiting for your decision."
						getRowId={(row) => row.requestId}
						isLoading={joinRequestsQuery.isLoading}
						loadingMessage="Loading join requests..."
					/>
				</div>
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-3">
					<h3 className="card-title text-base">Current access</h3>
					<p className="text-base-content/70 text-sm">See who currently has access, what level they hold, and when that access expires.</p>
					<TanstackTable
						columns={memberBoardColumns}
						data={memberRows}
						emptyMessage="No members found for this space."
						getRowId={(row) => `${row.spaceId}:${row.peerId}`}
						isLoading={membersQuery.isLoading}
						loadingMessage="Loading members..."
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="md:col-span-2 rounded-xl border border-base-300 bg-base-100 px-4 py-3 text-base-content/70 text-sm">
					Workspace model overrides stay local to this device. They do not change who can access the workspace.
				</div>
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
					<h3 className="card-title text-base">Workspace model features</h3>
					<p className="text-base-content/70 text-sm">
						Per-space model features stay local in electron-store and never change who can access the space.
					</p>
					<TanstackTable
						columns={workspaceCapabilityColumns}
						data={workspaceCapabilityRows}
						emptyMessage="No workspace model feature overrides yet."
						getRowId={(row) => row.modelName}
					/>
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
