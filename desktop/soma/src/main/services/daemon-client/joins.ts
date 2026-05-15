import type {
	DecideJoinResponse,
	JoinSpaceResponse,
	ListJoinRequestsResponse,
	RevokeSpaceResponse,
} from "@soma/proto/daemon/v1/daemon";

import type { DaemonGrpcClient } from "./connection";
import { unary } from "./connection";
import { fromJoinRequest } from "./mappers";
import type {
	DecideJoinInput,
	DecideJoinResult,
	JoinSpaceInput,
	JoinSpaceResult,
	RevokeMembershipInput,
	StoredJoinRequest,
} from "./types";

export async function joinSpace(client: DaemonGrpcClient, input: JoinSpaceInput): Promise<JoinSpaceResult> {
	if (!input.spaceId?.trim()) {
		throw new Error("spaceId is required");
	}
	if (!input.targetPeerId?.trim()) {
		throw new Error("targetPeerId is required");
	}
	const targetMultiaddrs = (input.targetMultiaddrs ?? [])
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	if (targetMultiaddrs.length === 0) {
		throw new Error("targetMultiaddrs is required");
	}

	const res = await unary<JoinSpaceResponse>((callback) => {
		client.joinSpace(
			{
				spaceId: input.spaceId.trim(),
				targetPeerId: input.targetPeerId.trim(),
				targetMultiaddrs,
				displayName: input.displayName?.trim() ?? "",
				deviceName: input.deviceName?.trim() ?? "",
			},
			callback,
		);
	});

	return {
		requestId: res.requestId,
	};
}

export async function listJoinRequests(client: DaemonGrpcClient): Promise<StoredJoinRequest[]> {
	const res = await unary<ListJoinRequestsResponse>((callback) => {
		client.listJoinRequests({}, callback);
	});

	return (res.requests ?? []).map((request) => fromJoinRequest(request));
}

export async function decideJoin(
	client: DaemonGrpcClient,
	input: DecideJoinInput,
): Promise<DecideJoinResult | null> {
	if (!input.requestId?.trim()) {
		throw new Error("requestId is required");
	}

	const res = await unary<DecideJoinResponse>((callback) => {
		client.decideJoin(
			{
				requestId: input.requestId.trim(),
				approve: input.approve,
				role: input.role?.trim() ?? "",
				reason: input.reason?.trim() ?? "",
			},
			callback,
		);
	});

	const decision = res.decision;
	if (!decision) return null;
	return {
		decisionId: decision.decisionId,
		spaceId: decision.spaceId?.value,
		subjectPeerId: decision.subjectPeerId?.value,
		decision: decision.decision,
		reason: decision.reason,
	};
}

export async function revokeSpaceMembership(
	client: DaemonGrpcClient,
	input: RevokeMembershipInput,
): Promise<boolean> {
	if (!input.spaceId?.trim()) {
		throw new Error("spaceId is required");
	}
	if (!input.subjectPeerId?.trim()) {
		throw new Error("subjectPeerId is required");
	}

	const res = await unary<RevokeSpaceResponse>((callback) => {
		client.revokeSpace(
			{
				spaceId: input.spaceId.trim(),
				subjectPeerId: input.subjectPeerId.trim(),
				reason: input.reason?.trim() ?? "",
			},
			callback,
		);
	});

	return !!res.accepted;
}
