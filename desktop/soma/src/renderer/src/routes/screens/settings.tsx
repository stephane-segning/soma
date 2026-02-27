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
import {
	type SpaceMember,
	useJoinSpaceMutation,
	useMyMembershipsQuery,
	useRevokeMembershipMutation,
	useSpacesQuery,
} from "@app/queries/spaces";
import { api } from "@app/store/api";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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
	const [joinDraft, setJoinDraft] = useState(() => ({
		spaceId: "",
		targetPeerId: "",
		targetMultiaddrs: "",
		displayName: "",
		deviceName: "",
	}));
	const [spaceMessage, setSpaceMessage] = useState<string | null>(null);
	const membershipsQuery = useMyMembershipsQuery();
	const spacesQuery = useSpacesQuery();
	const { mutateAsync: joinSpaceAsync, isLoading: isJoiningSpace } = useJoinSpaceMutation();
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

	const updateCapability = (
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
	};

	const removeCapabilityModel = (modelName: string) => {
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
	};

	const addCapabilityModel = () => {
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
	};

	const spaceNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const space of spacesQuery.data?.spaces ?? []) {
			if (space.spaceId) {
				map.set(space.spaceId, space.displayName?.trim() || space.spaceId);
			}
		}
		return map;
	}, [spacesQuery.data?.spaces]);

	const parseMultiaddrs = (rawValue: string): string[] => {
		const values = rawValue
			.split(/[\n,]/g)
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		return Array.from(new Set(values));
	};

	const submitJoinRequest = async () => {
		try {
			const targetMultiaddrs = parseMultiaddrs(joinDraft.targetMultiaddrs);
			if (!joinDraft.spaceId.trim()) {
				setSpaceMessage("Space ID is required.");
				return;
			}
			if (!joinDraft.targetPeerId.trim()) {
				setSpaceMessage("Target peer ID is required.");
				return;
			}
			if (targetMultiaddrs.length === 0) {
				setSpaceMessage("At least one target multiaddr is required.");
				return;
			}

			const result = await joinSpaceAsync({
				spaceId: joinDraft.spaceId.trim(),
				targetPeerId: joinDraft.targetPeerId.trim(),
				targetMultiaddrs,
				displayName: joinDraft.displayName.trim() || undefined,
				deviceName: joinDraft.deviceName.trim() || undefined,
			});

			setSpaceMessage(`Join request submitted (${result.requestId}).`);
			setJoinDraft((prev) => ({
				...prev,
				targetMultiaddrs: "",
			}));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setSpaceMessage(`Failed to submit join request: ${message}`);
		}
	};

	const leaveSpace = async (spaceId: string, subjectPeerId: string) => {
		try {
			const accepted = await revokeMembershipAsync({
				spaceId,
				subjectPeerId,
				reason: "left from settings",
			});
			setSpaceMessage(
				accepted
					? `Left space ${spaceNameById.get(spaceId) ?? spaceId}.`
					: `No membership row removed for ${spaceNameById.get(spaceId) ?? spaceId}.`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setSpaceMessage(`Failed to leave space: ${message}`);
		}
	};
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
				cell: ({ row }) => <span className="uppercase">{row.original.role || "unknown"}</span>,
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
					<h2 className="card-title text-base">Space access</h2>
					<p className="text-base-content/70 text-sm">
						Manage memberships, submit join requests, and leave spaces from one place.
					</p>
					{spaceMessage ? <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{spaceMessage}</div> : null}

					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<label className="form-control w-full">
							<span className="label-text">Space ID</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setJoinDraft((prev) => ({
										...prev,
										spaceId: event.target.value,
									}))
								}
								placeholder="space-123"
								value={joinDraft.spaceId}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">Target peer ID</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setJoinDraft((prev) => ({
										...prev,
										targetPeerId: event.target.value,
									}))
								}
								placeholder="12D3KooW..."
								value={joinDraft.targetPeerId}
							/>
						</label>
						<label className="form-control w-full md:col-span-2">
							<span className="label-text">Target multiaddrs (newline or comma separated)</span>
							<textarea
								className="textarea textarea-bordered min-h-20 w-full"
								onChange={(event) =>
									setJoinDraft((prev) => ({
										...prev,
										targetMultiaddrs: event.target.value,
									}))
								}
								placeholder="/ip4/203.0.113.7/tcp/14005/ws/p2p/12D3KooW...
/dns4/example.com/tcp/443/wss/p2p/12D3KooW..."
								value={joinDraft.targetMultiaddrs}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">Display name (optional)</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setJoinDraft((prev) => ({
										...prev,
										displayName: event.target.value,
									}))
								}
								placeholder="Your name"
								value={joinDraft.displayName}
							/>
						</label>
						<label className="form-control w-full">
							<span className="label-text">Device name (optional)</span>
							<input
								className="input input-bordered w-full"
								onChange={(event) =>
									setJoinDraft((prev) => ({
										...prev,
										deviceName: event.target.value,
									}))
								}
								placeholder="MacBook"
								value={joinDraft.deviceName}
							/>
						</label>
					</div>

					<div className="flex justify-end">
						<button
							className="btn btn-primary btn-sm"
							disabled={isJoiningSpace}
							onClick={() => void submitJoinRequest()}
							type="button"
						>
							{isJoiningSpace ? "Submitting..." : "Join space"}
						</button>
					</div>

					<TanstackTable
						columns={membershipColumns}
						data={memberships}
						emptyMessage="No memberships yet."
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
					<h2 className="card-title text-base">Global model capabilities</h2>
					<p className="text-base-content/70 text-sm">
						Capabilities are local hints for Soma UI only. They are never pushed to daemon/bot.
					</p>
					<TanstackTable
						columns={globalCapabilityColumns}
						data={globalCapabilityRows}
						emptyMessage="No capability overrides yet."
						getRowId={(row) => row.modelName}
					/>
					<div className="flex items-center gap-2">
						<input
							className="input input-bordered input-sm w-full"
							onChange={(event) => setNewCapabilityModel(event.target.value)}
							placeholder="Add model name (for manual capability mapping)"
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
