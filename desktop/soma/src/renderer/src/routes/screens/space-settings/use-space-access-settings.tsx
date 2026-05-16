import {
	type JoinRequestRecord,
	type SpaceMember,
	useDecideJoinMutation,
	useJoinRequestsQuery,
	useRevokeMembershipMutation,
	useSpaceMembersQuery,
} from "@app/queries/spaces";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { describeRole, formatRoleLabel, roleOptions } from "../access-utils";
import {
	DecisionNoteInput,
	type JoinApprovalColumnInput,
	RequestedAccessCell,
	RequesterCell,
	RoleSelect,
} from "./access-column-cells";

export function useSpaceAccessSettings(spaceId: string | undefined) {
	const joinRequestsQuery = useJoinRequestsQuery();
	const membersQuery = useSpaceMembersQuery(spaceId ?? "");
	const { mutateAsync: decideJoinAsync, isLoading: isDecidingJoin } = useDecideJoinMutation();
	const { mutateAsync: revokeMembershipAsync, isLoading: isRevokingMembership } = useRevokeMembershipMutation();
	const [spaceOpsMessage, setSpaceOpsMessage] = useState<string | null>(null);
	const [decisionRoleByRequest, setDecisionRoleByRequest] = useState<Record<string, string>>({});
	const [decisionReasonByRequest, setDecisionReasonByRequest] = useState<Record<string, string>>({});
	const memberRows = membersQuery.data ?? [];
	const approvalRoleOptions = useMemo(() => roleOptions(), []);

	const pendingJoinRequests = useMemo(() => {
		if (!spaceId) return [];
		return (joinRequestsQuery.data ?? []).filter((request) => request.spaceId === spaceId);
	}, [joinRequestsQuery.data, spaceId]);

	const formatEpoch = useCallback((value: number): string => {
		if (!value || value <= 0) return "Unknown";
		const millis = value > 10_000_000_000 ? value : value * 1000;
		const date = new Date(millis);
		return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
	}, []);

	const decideJoinRequest = useCallback(
		async (requestId: string, approve: boolean) => {
			try {
				const role = decisionRoleByRequest[requestId]?.trim();
				const reason = decisionReasonByRequest[requestId]?.trim();
				const result = await decideJoinAsync({
					requestId,
					approve,
					role: role || undefined,
					reason: reason || undefined,
				});
				setSpaceOpsMessage(buildDecisionMessage(approve, result?.subjectPeerId, role));
				setDecisionRoleByRequest((prev) => omitKey(prev, requestId));
				setDecisionReasonByRequest((prev) => omitKey(prev, requestId));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setSpaceOpsMessage(`Failed to decide join request: ${message}`);
			}
		},
		[decideJoinAsync, decisionReasonByRequest, decisionRoleByRequest],
	);

	const revokeMember = useCallback(
		async (subjectPeerId: string) => {
			if (!spaceId) return;
			if (
				!window.confirm(
					`Revoke access for ${subjectPeerId}? They will lose their current membership for this workspace.`,
				)
			)
				return;
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
		},
		[revokeMembershipAsync, spaceId],
	);

	const joinApprovalColumns = useJoinApprovalColumns({
		approvalRoleOptions,
		decisionReasonByRequest,
		decisionRoleByRequest,
		decideJoinRequest,
		formatEpoch,
		isDecidingJoin,
		setDecisionReasonByRequest,
		setDecisionRoleByRequest,
	});
	const memberBoardColumns = useMemberBoardColumns(formatEpoch, isRevokingMembership, revokeMember);

	return {
		joinApprovalColumns,
		joinRequestsQuery,
		memberBoardColumns,
		memberRows,
		membersQuery,
		pendingJoinRequests,
		spaceOpsMessage,
	};
}

export type SpaceAccessSettings = ReturnType<typeof useSpaceAccessSettings>;

function useJoinApprovalColumns(input: JoinApprovalColumnInput) {
	return useMemo<ColumnDef<JoinRequestRecord>[]>(
		() => [
			{ header: "Requester", cell: ({ row }) => <RequesterCell request={row.original} /> },
			{ header: "Requested access level", cell: ({ row }) => <RequestedAccessCell request={row.original} /> },
			{ header: "Requested at", cell: ({ row }) => input.formatEpoch(row.original.createdAt) },
			{ header: "Grant as", cell: ({ row }) => <RoleSelect input={input} requestId={row.original.requestId} /> },
			{
				header: "Decision note",
				cell: ({ row }) => <DecisionNoteInput input={input} requestId={row.original.requestId} />,
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="space-x-1 whitespace-nowrap text-right">
						<button
							className="btn btn-success btn-outline btn-xs"
							disabled={input.isDecidingJoin}
							onClick={() => void input.decideJoinRequest(row.original.requestId, true)}
							type="button"
						>
							Approve
						</button>
						<button
							className="btn btn-error btn-outline btn-xs"
							disabled={input.isDecidingJoin}
							onClick={() => void input.decideJoinRequest(row.original.requestId, false)}
							type="button"
						>
							Reject
						</button>
					</div>
				),
			},
		],
		[input],
	);
}

function useMemberBoardColumns(
	formatEpoch: (value: number) => string,
	isRevokingMembership: boolean,
	revokeMember: (peerId: string) => Promise<void>,
) {
	return useMemo<ColumnDef<SpaceMember>[]>(
		() => [
			{ header: "Peer", cell: ({ row }) => <span className="font-mono text-xs">{row.original.peerId}</span> },
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
}

function buildDecisionMessage(approve: boolean, subjectPeerId: string | undefined, role: string | undefined): string {
	if (!approve) {
		return `Rejected access request${subjectPeerId ? ` for ${subjectPeerId}` : ""}.`;
	}
	return `Approved access${subjectPeerId ? ` for ${subjectPeerId}` : ""}${role ? ` as ${formatRoleLabel(role)}` : ""}. If the requester is offline, Soma delivers the decision when they reconnect.`;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	const next = { ...record };
	delete next[key];
	return next;
}
