import { TanstackTable } from "@app/components/tables/tanstack-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import type { AgentModelCapabilities, GlobalCapabilityRow } from "./use-global-agent-settings";

type ModelFeaturesSectionProps = {
	addCapabilityModel: () => void;
	isSaving: boolean;
	newCapabilityModel: string;
	normalizeCapabilities: () => void;
	onNewCapabilityModelChange: (value: string) => void;
	persist: () => Promise<void>;
	removeCapabilityModel: (modelName: string) => void;
	rows: GlobalCapabilityRow[];
	updateCapability: (modelName: string, key: keyof Omit<AgentModelCapabilities, "updatedAtMs">, value: boolean) => void;
};

export function ModelFeaturesSection(props: ModelFeaturesSectionProps): React.JSX.Element {
	const columns = useModelCapabilityColumns(props.updateCapability, props.removeCapabilityModel);
	return (
		<div className="card border border-base-300 bg-base-100">
			<div className="card-body space-y-4">
				<h2 className="card-title text-base">Global model features</h2>
				<p className="text-base-content/70 text-sm">
					Model features are local hints for the Soma UI only. They do not grant membership or security permissions.
				</p>
				<TanstackTable columns={columns} data={props.rows} emptyMessage="No model feature overrides yet." getRowId={(row) => row.modelName} />
				<div className="flex items-center gap-2">
					<input
						className="input input-bordered input-sm w-full"
						onChange={(event) => props.onNewCapabilityModelChange(event.target.value)}
						placeholder="Add model name (for manual feature mapping)"
						value={props.newCapabilityModel}
					/>
					<button className="btn btn-sm" onClick={props.addCapabilityModel} type="button">Add</button>
				</div>
				<div className="flex items-center justify-end gap-2">
					<button className="btn btn-outline btn-sm" onClick={props.normalizeCapabilities} type="button">Normalize</button>
					<button className="btn btn-primary btn-sm" disabled={props.isSaving} onClick={() => void props.persist()} type="button">
						{props.isSaving ? "Saving..." : "Save settings"}
					</button>
				</div>
			</div>
		</div>
	);
}

function useModelCapabilityColumns(
	updateCapability: ModelFeaturesSectionProps["updateCapability"],
	removeCapabilityModel: (modelName: string) => void,
) {
	const capabilityColumns = [
		{ key: "chat", label: "Chat" },
		{ key: "embed", label: "Embed" },
		{ key: "tool", label: "Tool" },
		{ key: "image", label: "Image" },
	] as const;
	return useMemo<ColumnDef<GlobalCapabilityRow>[]>(
		() => [
			{ header: "Model", cell: ({ row }) => <span className="font-medium">{row.original.modelName}</span> },
			...capabilityColumns.map(({ key, label }): ColumnDef<GlobalCapabilityRow> => ({
				header: label,
				cell: ({ row }) => (
					<input
						checked={row.original.caps[key] === true}
						className="checkbox checkbox-sm"
						onChange={(event) => updateCapability(row.original.modelName, key, event.target.checked)}
						type="checkbox"
					/>
				),
			})),
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<button className="btn btn-ghost btn-xs" onClick={() => removeCapabilityModel(row.original.modelName)} type="button">
						Remove
					</button>
				),
			},
		],
		[removeCapabilityModel, updateCapability],
	);
}
