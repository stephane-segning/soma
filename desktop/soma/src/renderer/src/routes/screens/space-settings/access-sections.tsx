import { TanstackTable } from "@app/components/tables/tanstack-table";
import { Link } from "react-router";
import { membershipSummary } from "../access-utils";
import type { SpaceAccessSettings } from "./use-space-access-settings";

export function SpaceAccessSummary({
	memberRows,
	pendingJoinRequests,
	spaceId,
}: Pick<SpaceAccessSettings, "memberRows" | "pendingJoinRequests"> & { spaceId?: string }): React.JSX.Element {
	return (
		<div className="grid gap-3 md:grid-cols-3">
			<SummaryCard detail={membershipSummary(memberRows)} label="Members" title={String(memberRows.length)} />
			<SummaryCard
				detail="Approve or reject people waiting for access"
				label="Pending requests"
				title={String(pendingJoinRequests.length)}
			/>
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
	);
}

export function JoinRequestsSection(settings: SpaceAccessSettings): React.JSX.Element {
	return (
		<div className="card border border-base-300 bg-base-100">
			<div className="card-body space-y-3">
				<h3 className="card-title text-base">Access requests</h3>
				<p className="text-base-content/70 text-sm">
					Review pending access requests and choose the access level this peer should receive.
				</p>
				<div className="rounded-xl border border-base-300 bg-base-200/50 px-4 py-3 text-base-content/70 text-xs">
					Most people should be granted Editor, Viewer, or Member. Use Owner sparingly. Use Bot only for trusted
					non-human peers.
					<div className="mt-2">
						Bot membership does not automatically grant join approval authority. Bot actions should stay within approved
						automation for this space.
					</div>
				</div>
				<TanstackTable
					columns={settings.joinApprovalColumns}
					data={settings.pendingJoinRequests}
					emptyMessage="No access requests are currently waiting for your decision."
					getRowId={(row) => row.requestId}
					isLoading={settings.joinRequestsQuery.isLoading}
					loadingMessage="Loading join requests..."
				/>
			</div>
		</div>
	);
}

export function CurrentAccessSection(settings: SpaceAccessSettings): React.JSX.Element {
	return (
		<div className="card border border-base-300 bg-base-100">
			<div className="card-body space-y-3">
				<h3 className="card-title text-base">Current access</h3>
				<p className="text-base-content/70 text-sm">
					See who currently has access, what level they hold, and when that access expires.
				</p>
				<TanstackTable
					columns={settings.memberBoardColumns}
					data={settings.memberRows}
					emptyMessage="No members found for this space."
					getRowId={(row) => `${row.spaceId}:${row.peerId}`}
					isLoading={settings.membersQuery.isLoading}
					loadingMessage="Loading members..."
				/>
			</div>
		</div>
	);
}

function SummaryCard({ label, title, detail }: { label: string; title: string; detail: string }) {
	return (
		<div className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
			<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">{label}</div>
			<div className="mt-1 font-semibold text-xl">{title}</div>
			<div className="text-base-content/70 text-xs">{detail}</div>
		</div>
	);
}
