import { TanstackTable } from "@app/components/tables/tanstack-table";
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
import { type SpaceMember, useMyMembershipsQuery, useRevokeMembershipMutation, useSpacesQuery } from "@app/queries/spaces";
import { api } from "@app/store/api";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { describeRole, formatRoleLabel } from "./access-utils";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { data: rawConfig } = useSettingQuery(AGENT_CONFIG_SETTINGS_KEY);
	const { mutateAsync, isLoading: isSaving } = useSetSettingMutation();
	const { data: models } = api.useListAgentModelsQuery(undefined, {
		refetchOnMountOrArgChange: false,
	});
	const [draft, setDraft] = useState<AgentRuntimeConfig>(() => ({
		...DEFAULT_AGENT_RUNTIME_CONFIG,
	}));
	const [newCapabilityModel, setNewCapabilityModel] = useState("");
	const [spaceMessage, setSpaceMessage] = useState<string | null>(null);
	const membershipsQuery = useMyMembershipsQuery();
	const spacesQuery = useSpacesQuery();
	const { mutateAsync: revokeMembershipAsync, isLoading: isRevokingMembership } = useRevokeMembershipMutation();

	useEffect(() => {
		setDraft(normalizeAgentRuntimeConfig(rawConfig));
	}, [rawConfig]);

	const capabilityModels = useMemo(() => {
		const names = new Set<string>();
		for (const model of models ?? []) names.add(model.name);
		for (const modelName of Object.keys(draft.modelCapabilities)) names.add(modelName);
		return Array.from(names).sort((left, right) => left.localeCompare(right));
	}, [draft.modelCapabilities, models]);

	const persist = async () => {
		await mutateAsync({
			key: AGENT_CONFIG_SETTINGS_KEY,
			value: normalizeAgentRuntimeConfig(draft),
		});
	};

	const updateCapability = useCallback((
		modelName: string,
		key: keyof Omit<AgentModelCapabilities, "updatedAtMs">,
		value: boolean,
	) => {
		const normalizedName = normalizeOptionalString(modelName);
		if (!normalizedName) return;
		setDraft((prev) => {
			const current = prev.modelCapabilities[normalizedName] ?? {};
			const nextCaps: AgentModelCapabilities = {
				...current,
				[key]: value,
				updatedAtMs: Date.now(),
			};
			return {
				...prev,
				modelCapabilities: {
					...prev.modelCapabilities,
					[normalizedName]: nextCaps,
				},
			};
		});
	}, []);

	const removeCapabilityModel = useCallback((modelName: string) => {
		setDraft((prev) => {
			const next = {
				...prev.modelCapabilities,
			};
			delete next[modelName];
			return {
				...prev,
				modelCapabilities: next,
			};
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

	const spaceNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const space of spacesQuery.data?.spaces ?? []) {
			if (space.spaceId) {
				map.set(space.spaceId, space.displayName?.trim() || space.spaceId);
			}
		}
		return map;
	}, [spacesQuery.data?.spaces]);

	const leaveSpace = useCallback(async (spaceId: string, subjectPeerId: string) => {
		const spaceName = spaceNameById.get(spaceId) ?? spaceId;
		if (!window.confirm(`Leave ${spaceName}? This removes this device's current membership for that workspace.`)) {
			return;
		}
		try {
			const accepted = await revokeMembershipAsync({
				spaceId,
				subjectPeerId,
				reason: "left from settings",
			});
			setSpaceMessage(
				accepted
					? `Left ${spaceName}.`
					: `No active membership was removed for ${spaceName}.`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setSpaceMessage(`Failed to leave space: ${message}`);
		}
	}, [revokeMembershipAsync, spaceNameById]);
	const memberships = membershipsQuery.data ?? [];
	const membershipColumns = useMemo<ColumnDef<SpaceMember>[]>(
		() => [
			{
				header: "Space",
				cell: ({ row }) => (
					<span className="font-medium">{spaceNameById.get(row.original.spaceId) ?? row.original.spaceId}</span>
				),
			},
			{
				header: "Role",
				cell: ({ row }) => (
					<div className="space-y-1">
						<div className="font-medium text-sm">{formatRoleLabel(row.original.role || "unknown")}</div>
						<div className="max-w-xs text-base-content/60 text-xs">{describeRole(row.original.role)}</div>
					</div>
				),
			},
			{
				header: "Expiry",
				cell: ({ row }) =>
					row.original.expiresAt > 0 ? new Date(row.original.expiresAt * 1000).toLocaleString() : "No expiry",
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="text-right">
						<button
							className="btn btn-error btn-outline btn-xs"
							disabled={isRevokingMembership}
							onClick={() => void leaveSpace(row.original.spaceId, row.original.peerId)}
							type="button"
						>
							Quit
						</button>
					</div>
				),
			},
		],
		[isRevokingMembership, leaveSpace, spaceNameById],
	);
	const globalCapabilityRows = useMemo(
		() =>
			capabilityModels.map((modelName) => ({
				modelName,
				caps: draft.modelCapabilities[modelName] ?? {},
			})),
		[capabilityModels, draft.modelCapabilities],
	);
	const globalCapabilityColumns = useMemo<
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
		<div className="space-y-6">
			<h1 className="font-semibold text-2xl">{t("settings.title", "Settings")}</h1>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-4">
					<h2 className="card-title text-base">People and access</h2>
					<p className="text-base-content/70 text-sm">
						These are this device&apos;s current space memberships. Open a space&apos;s settings to manage other members and approvals.
					</p>
					{spaceMessage ? <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{spaceMessage}</div> : null}

					<div className="grid gap-3 md:grid-cols-3">
						<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
							<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">Memberships</div>
							<div className="mt-1 font-semibold text-xl">{memberships.length}</div>
							<div className="text-base-content/70 text-xs">Workspaces this device can currently open</div>
						</div>
						<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
							<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">Advanced join</div>
							<div className="mt-1 font-semibold text-base">Request access to a space</div>
							<div className="text-base-content/70 text-xs">Use this when an existing member sends manual connection info</div>
							<div className="mt-2">
								<Link className="btn btn-ghost btn-xs" to="/spaces/join">
									Open join screen
								</Link>
							</div>
						</div>
						<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
							<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">What happens next</div>
							<div className="mt-1 font-semibold text-base">Pending until approval</div>
							<div className="text-base-content/70 text-xs">A request does not grant access until the workspace approves it</div>
						</div>
					</div>

					<TanstackTable
						columns={membershipColumns}
						data={memberships}
						emptyMessage={<span>This device is not a member of any spaces yet. Use the join screen or create a new space.</span>}
						getRowId={(row) => `${row.spaceId}:${row.peerId}`}
						isLoading={membershipsQuery.isLoading}
						loadingMessage="Loading memberships..."
					/>
				</div>
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-4">
					<h2 className="card-title text-base">{t("settings.connectivity", "Connectivity")}</h2>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<label className="form-control w-full">
							<span className="label-text">Provider</span>
							<select
								className="select select-bordered w-full"
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										provider: event.target.value as AgentProvider,
									}))
								}
								value={draft.provider}
							>
								<option value="openai-compatible">openai-compatible</option>
								<option value="agentd">agentd</option>
							</select>
						</label>
						<label className="form-control w-full">
							<span className="label-text">API base URL</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										openAiBaseUrl: event.target.value,
									}))
								}
								placeholder="http://127.0.0.1:11434/v1"
								value={draft.openAiBaseUrl}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">API key (optional)</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										openAiApiKey: event.target.value,
									}))
								}
								placeholder="sk-..."
								type="password"
								value={draft.openAiApiKey ?? ""}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">Default chat model</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										openAiChatModel: event.target.value,
									}))
								}
								placeholder="llama3.2"
								value={draft.openAiChatModel}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">Default embed model</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										openAiEmbedModel: event.target.value,
									}))
								}
								placeholder="nomic-embed-text"
								value={draft.openAiEmbedModel}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">Request timeout (ms)</span>
							<input
								className="input input-bordered w-full"
								min={3000}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										requestTimeoutMs: Number(event.target.value || prev.requestTimeoutMs),
									}))
								}
								type="number"
								value={draft.requestTimeoutMs}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">Status poll interval (ms)</span>
							<input
								className="input input-bordered w-full"
								min={1000}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										pollIntervalMs: Number(event.target.value || prev.pollIntervalMs),
									}))
								}
								type="number"
								value={draft.pollIntervalMs}
							/>
						</label>
					</div>
				</div>
			</div>

			<div className="card border border-base-300 bg-base-100">
				<div className="card-body space-y-4">
					<h2 className="card-title text-base">Global model features</h2>
					<p className="text-base-content/70 text-sm">
						Model features are local hints for the Soma UI only. They do not grant membership or security permissions.
					</p>
					<TanstackTable
						columns={globalCapabilityColumns}
						data={globalCapabilityRows}
						emptyMessage="No model feature overrides yet."
						getRowId={(row) => row.modelName}
					/>
					<div className="flex items-center gap-2">
						<input
							className="input input-bordered input-sm w-full"
							onChange={(event) => setNewCapabilityModel(event.target.value)}
							placeholder="Add model name (for manual feature mapping)"
							value={newCapabilityModel}
						/>
						<button className="btn btn-sm" onClick={addCapabilityModel} type="button">
							Add
						</button>
					</div>
					<div className="flex items-center justify-end gap-2">
						<button
							className="btn btn-outline btn-sm"
							onClick={() =>
								setDraft((prev) => ({
									...prev,
									modelCapabilities: normalizeModelCapabilitiesMap(prev.modelCapabilities),
								}))
							}
							type="button"
						>
							Normalize
						</button>
						<button className="btn btn-primary btn-sm" disabled={isSaving} onClick={() => void persist()} type="button">
							{isSaving ? "Saving..." : "Save settings"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export { Component };
