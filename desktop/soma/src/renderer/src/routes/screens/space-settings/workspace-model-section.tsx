import { TanstackTable } from "@app/components/tables/tanstack-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import type {
	AgentModelCapabilities,
	AgentWorkspaceRuntimeConfig,
	WorkspaceCapabilityRow,
} from "./use-workspace-agent-settings";
import { DEFAULT_AGENT_RUNTIME_CONFIG } from "./use-workspace-agent-settings";

type WorkspaceModelSectionProps = {
	effectiveConfig: { chatModel?: string; embedModel?: string };
	isSaving: boolean;
	newCapabilityModel: string;
	onAddCapabilityModel: () => void;
	onNewCapabilityModelChange: (value: string) => void;
	onPersist: () => Promise<void>;
	onRemoveCapabilityModel: (modelName: string) => void;
	onUpdateCapability: (modelName: string, key: keyof Omit<AgentModelCapabilities, "updatedAtMs">, value: boolean) => void;
	rows: WorkspaceCapabilityRow[];
	setWorkspaceDraft: Dispatch<SetStateAction<AgentWorkspaceRuntimeConfig>>;
	spaceId?: string;
	workspaceDraft: AgentWorkspaceRuntimeConfig;
};

export function WorkspaceModelSection(props: WorkspaceModelSectionProps): React.JSX.Element {
	const columns = useWorkspaceCapabilityColumns(props.onUpdateCapability, props.onRemoveCapabilityModel);
	return (
		<>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="md:col-span-2 rounded-xl border border-base-300 bg-base-100 px-4 py-3 text-base-content/70 text-sm">
					Workspace model overrides stay local to this device. They do not change who can access the workspace.
				</div>
				<WorkspaceTextInput
					label="Workspace chat model override"
					onChange={(chatModel) => props.setWorkspaceDraft((prev) => ({ ...prev, chatModel }))}
					placeholder={props.effectiveConfig.chatModel || DEFAULT_AGENT_RUNTIME_CONFIG.openAiChatModel}
					value={props.workspaceDraft.chatModel ?? ""}
				/>
				<WorkspaceTextInput
					label="Workspace embed model override"
					onChange={(embedModel) => props.setWorkspaceDraft((prev) => ({ ...prev, embedModel }))}
					placeholder={props.effectiveConfig.embedModel || DEFAULT_AGENT_RUNTIME_CONFIG.openAiEmbedModel}
					value={props.workspaceDraft.embedModel ?? ""}
				/>
			</div>
			<div className="card border border-base-300 bg-base-100">
				<div className="card-body">
					<h3 className="card-title text-base">Workspace model features</h3>
					<p className="text-base-content/70 text-sm">
						Per-space model features stay local in electron-store and never change who can access the space.
					</p>
					<TanstackTable columns={columns} data={props.rows} emptyMessage="No workspace model feature overrides yet." getRowId={(row) => row.modelName} />
					<div className="flex items-center gap-2 pt-2">
						<input className="input input-bordered input-sm w-full" onChange={(event) => props.onNewCapabilityModelChange(event.target.value)} placeholder="Add model name" value={props.newCapabilityModel} />
						<button className="btn btn-sm" onClick={props.onAddCapabilityModel} type="button">Add</button>
					</div>
					<div className="flex items-center justify-end gap-2 pt-2">
						<button className="btn btn-outline btn-sm" onClick={() => props.setWorkspaceDraft({})} type="button">Clear workspace overrides</button>
						<button className="btn btn-primary btn-sm" disabled={!props.spaceId || props.isSaving} onClick={() => void props.onPersist()} type="button">
							{props.isSaving ? "Saving..." : "Save workspace settings"}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

function useWorkspaceCapabilityColumns(
	updateCapability: WorkspaceModelSectionProps["onUpdateCapability"],
	removeCapabilityModel: (modelName: string) => void,
) {
	const capabilityColumns = [
		{ key: "chat", label: "Chat" },
		{ key: "embed", label: "Embed" },
		{ key: "tool", label: "Tool" },
		{ key: "image", label: "Image" },
	] as const;
	return useMemo<ColumnDef<WorkspaceCapabilityRow>[]>(
		() => [
			{ header: "Model", cell: ({ row }) => <span className="font-medium">{row.original.modelName}</span> },
			...capabilityColumns.map(({ key, label }): ColumnDef<WorkspaceCapabilityRow> => ({
				header: label,
				cell: ({ row }) => (
					<input checked={row.original.caps[key] === true} className="checkbox checkbox-sm" onChange={(event) => updateCapability(row.original.modelName, key, event.target.checked)} type="checkbox" />
				),
			})),
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<button className="btn btn-ghost btn-xs" onClick={() => removeCapabilityModel(row.original.modelName)} type="button">Remove</button>
				),
			},
		],
		[removeCapabilityModel, updateCapability],
	);
}

function WorkspaceTextInput({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder: string; value: string }) {
	return (
		<label className="form-control w-full">
			<span className="label-text">{label}</span>
			<input className="input input-bordered w-full" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
		</label>
	);
}
