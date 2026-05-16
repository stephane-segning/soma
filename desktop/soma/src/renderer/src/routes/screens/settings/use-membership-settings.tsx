import { TanstackTable } from "@app/components/tables/tanstack-table";
import {
	type SpaceMember,
	useMyMembershipsQuery,
	useRevokeMembershipMutation,
	useSpacesQuery,
} from "@app/queries/spaces";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { describeRole, formatRoleLabel } from "../access-utils";

export function useMembershipSettings() {
	const [spaceMessage, setSpaceMessage] = useState<string | null>(null);
	const membershipsQuery = useMyMembershipsQuery();
	const spacesQuery = useSpacesQuery();
	const { mutateAsync: revokeMembershipAsync, isLoading: isRevokingMembership } = useRevokeMembershipMutation();
	const memberships = membershipsQuery.data ?? [];

	const spaceNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const space of spacesQuery.data?.spaces ?? []) {
			if (space.spaceId) map.set(space.spaceId, space.displayName?.trim() || space.spaceId);
		}
		return map;
	}, [spacesQuery.data?.spaces]);

	const leaveSpace = useCallback(
		async (spaceId: string, subjectPeerId: string) => {
			const spaceName = spaceNameById.get(spaceId) ?? spaceId;
			if (!window.confirm(`Leave ${spaceName}? This removes this device's current membership for that workspace.`))
				return;
			try {
				const accepted = await revokeMembershipAsync({
					spaceId,
					subjectPeerId,
					reason: "left from settings",
				});
				setSpaceMessage(accepted ? `Left ${spaceName}.` : `No active membership was removed for ${spaceName}.`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setSpaceMessage(`Failed to leave space: ${message}`);
			}
		},
		[revokeMembershipAsync, spaceNameById],
	);

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

	return { membershipColumns, memberships, membershipsQuery, spaceMessage };
}

export function PeopleAccessSection({
	membershipColumns,
	memberships,
	membershipsQuery,
	spaceMessage,
}: ReturnType<typeof useMembershipSettings>): React.JSX.Element {
	return (
		<div className="card border border-base-300 bg-base-100">
			<div className="card-body space-y-4">
				<h2 className="card-title text-base">People and access</h2>
				<p className="text-base-content/70 text-sm">
					These are this device&apos;s current space memberships. Open a space&apos;s settings to manage other members
					and approvals.
				</p>
				{spaceMessage ? <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{spaceMessage}</div> : null}
				<div className="grid gap-3 md:grid-cols-3">
					<AccessStat
						detail="Workspaces this device can currently open"
						label="Memberships"
						title={String(memberships.length)}
					/>
					<AccessStat
						detail="Use this when an existing member sends manual connection info"
						label="Advanced join"
						title="Request access to a space"
					>
						<Link className="btn btn-ghost btn-xs" to="/spaces/join">
							Open join screen
						</Link>
					</AccessStat>
					<AccessStat
						detail="Submitting a request does not make this device a member yet"
						label="What happens next"
						title="Waiting for approval"
					/>
				</div>
				<TanstackTable
					columns={membershipColumns}
					data={memberships}
					emptyMessage={
						<span>This device is not a member of any spaces yet. Use the join screen or create a new space.</span>
					}
					getRowId={(row) => `${row.spaceId}:${row.peerId}`}
					isLoading={membershipsQuery.isLoading}
					loadingMessage="Loading memberships..."
				/>
			</div>
		</div>
	);
}

function AccessStat({
	label,
	title,
	detail,
	children,
}: {
	label: string;
	title: string;
	detail: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
			<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">{label}</div>
			<div className="mt-1 font-semibold text-base">{title}</div>
			<div className="text-base-content/70 text-xs">{detail}</div>
			{children ? <div className="mt-2">{children}</div> : null}
		</div>
	);
}
