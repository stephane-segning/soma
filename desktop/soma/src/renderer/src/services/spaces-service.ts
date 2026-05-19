import { invoke } from "../lib/ipc";

export type Space = {
	spaceId: string;
	displayName: string;
	ownerPeerId: string;
	createdAt: number;
};

export type SpaceMember = {
	peerId: string;
	role: string;
	expiresAt: number;
	spaceId: string;
};

export type JoinSpaceInput = {
	spaceId: string;
	targetPeerId: string;
	targetMultiaddrs: string[];
	displayName?: string;
	deviceName?: string;
};

export type JoinSpaceResult = {
	requestId: string;
};

export type JoinRequestRecord = {
	requestId: string;
	spaceId: string;
	subjectPeerId: string;
	displayName: string;
	deviceName: string;
	requestedRole: number;
	createdAt: number;
};

export type DecideJoinInput = {
	requestId: string;
	approve: boolean;
	role?: string;
	reason?: string;
};

export type DecideJoinResult = {
	decisionId: string;
	spaceId?: string;
	subjectPeerId?: string;
	decision: number;
	reason: string;
};

export type RevokeMembershipInput = {
	spaceId: string;
	subjectPeerId: string;
	reason?: string;
};

export type ListSpacesResult = {
	spaces: Space[];
	limit: number;
	offset: number;
	nextOffset?: number | null;
};

export async function listSpaces(params?: {
	limit?: number;
	offset?: number;
	query?: string;
}): Promise<ListSpacesResult> {
	const payload = {
		limit: params?.limit,
		offset: params?.offset,
		q: params?.query,
	};
	return invoke<ListSpacesResult>("spaces_list", payload);
}

export async function createSpace(input: { spaceId?: string; displayName?: string }): Promise<Space> {
	const res = await invoke<Space>("spaces_create", {
		spaceId: input.spaceId,
		displayName: input.displayName,
	});
	return res;
}

export async function getSpace(spaceId: string): Promise<Space> {
	return invoke<Space>("spaces_get", {
		spaceId,
	});
}

export async function listSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
	if (!spaceId) return [];
	return invoke<SpaceMember[]>("spaces_list_members", {
		spaceId,
	}).catch(() => []);
}

/**
 * Bot-only flavor of {@link listSpaceMembers}. Calls the daemon's
 * `spaces_list_bots` IPC, which filters memberships server-side to
 * `role === "bot"`. Returns an empty list on either IPC failure or an
 * empty `spaceId`, matching the `listSpaceMembers` contract so the
 * Bots tab can render an empty state without a fallback branch.
 */
export async function listSpaceBots(spaceId: string): Promise<SpaceMember[]> {
	if (!spaceId) return [];
	return invoke<SpaceMember[]>("spaces_list_bots", {
		spaceId,
	}).catch(() => []);
}

export async function listMyMemberships(): Promise<SpaceMember[]> {
	return invoke<SpaceMember[]>("spaces_list_my_memberships").catch(() => []);
}

export async function joinSpace(input: JoinSpaceInput): Promise<JoinSpaceResult> {
	return invoke<JoinSpaceResult>("spaces_join", input);
}

export async function listJoinRequests(): Promise<JoinRequestRecord[]> {
	return invoke<JoinRequestRecord[]>("spaces_list_join_requests").catch(() => []);
}

export async function decideJoin(input: DecideJoinInput): Promise<DecideJoinResult | null> {
	return invoke<DecideJoinResult | null>("spaces_decide_join", input).catch(() => null);
}

export async function revokeMembership(input: RevokeMembershipInput): Promise<boolean> {
	return invoke<boolean>("spaces_revoke_member", input).catch(() => false);
}

export type IssueIssuerCapabilityInput = {
	spaceId: string;
	targetPeerId: string;
	/** Absolute expiry in milliseconds since the unix epoch. */
	expiresAt: number;
};

export async function issueIssuerCapability(
	input: IssueIssuerCapabilityInput,
): Promise<boolean> {
	return invoke<boolean>("spaces_issue_issuer_capability", input);
}

export async function updateSpace(input: { spaceId: string; displayName?: string }): Promise<Space> {
	return invoke<Space>("spaces_update", {
		spaceId: input.spaceId,
		displayName: input.displayName,
	});
}

export async function deleteSpace(spaceId: string): Promise<boolean> {
	return invoke<boolean>("spaces_delete", {
		spaceId,
	});
}
