import type { JoinRequestRecord } from "@app/queries/spaces";
import type { Dispatch, SetStateAction } from "react";
import { requestedAccessLevelLabel } from "../access-utils";

export type JoinApprovalColumnInput = {
	approvalRoleOptions: { value: string; label: string }[];
	decisionReasonByRequest: Record<string, string>;
	decisionRoleByRequest: Record<string, string>;
	decideJoinRequest: (requestId: string, approve: boolean) => Promise<void>;
	formatEpoch: (value: number) => string;
	isDecidingJoin: boolean;
	setDecisionReasonByRequest: Dispatch<SetStateAction<Record<string, string>>>;
	setDecisionRoleByRequest: Dispatch<SetStateAction<Record<string, string>>>;
};

export function RequesterCell({ request }: { request: JoinRequestRecord }) {
	return (
		<div>
			<div className="font-medium text-sm">{request.displayName || request.subjectPeerId}</div>
			<div className="font-mono text-xs">{request.subjectPeerId}</div>
			{request.displayName ? (
				<div className="text-base-content/60 text-xs">{request.deviceName || "Unknown device"}</div>
			) : null}
		</div>
	);
}

export function RequestedAccessCell({ request }: { request: JoinRequestRecord }) {
	return (
		<div className="space-y-1">
			<div className="font-medium text-sm">{requestedAccessLevelLabel(request.requestedRole)}</div>
			<div className="max-w-xs text-base-content/60 text-xs">
				Current desktop requests do not include a role choice, so they usually arrive as Member unless you change it
				here.
			</div>
		</div>
	);
}

export function RoleSelect({ input, requestId }: { input: JoinApprovalColumnInput; requestId: string }) {
	return (
		<select
			className="select select-bordered select-xs w-full min-w-28"
			onChange={(event) =>
				input.setDecisionRoleByRequest((prev) => ({
					...prev,
					[requestId]: event.target.value,
				}))
			}
			value={input.decisionRoleByRequest[requestId] ?? ""}
		>
			<option value="">requested/default</option>
			{input.approvalRoleOptions.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	);
}

export function DecisionNoteInput({ input, requestId }: { input: JoinApprovalColumnInput; requestId: string }) {
	return (
		<input
			className="input input-bordered input-xs w-full min-w-32"
			onChange={(event) =>
				input.setDecisionReasonByRequest((prev) => ({
					...prev,
					[requestId]: event.target.value,
				}))
			}
			placeholder="Optional note"
			value={input.decisionReasonByRequest[requestId] ?? ""}
		/>
	);
}
