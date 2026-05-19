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

export type SpaceBotStatus = "pending" | "active" | "failed" | "expired";

export type SpaceBot = {
	spaceId: string;
	peerId: string;
	expiresAt: number;
	/** Operator-typed alias from the Bots-tab Add form, or `null` if blank. */
	alias: string | null;
	/**
	 * Current state of the delegation. `expired` is derived server-side
	 * from `expires_at`; `pending`/`active`/`failed` flow from the
	 * persistent state (today every issuance is recorded as `active` —
	 * the handshake protocol that introduces `pending`/`failed`
	 * transitions lands in a follow-up).
	 */
	status: SpaceBotStatus;
};

/**
 * Bot list flavor of {@link listSpaceMembers}. Calls the daemon's
 * `spaces_list_bots` IPC, which reads from the issuer-capability store
 * (the same place the Add flow writes to).
 *
 * Unlike `listSpaceMembers`, this *does not* swallow IPC errors — the
 * RTK Query wrapping this call in `accessApi.listSpaceBots` already
 * catches rejection and routes it into `query.error`, which
 * `useSpaceBots` then surfaces as `loadError`. Eating the error here
 * would hide daemon-connectivity failures behind a permanent empty
 * state, which is what the Bots tab is supposed to distinguish from a
 * truly bot-less space.
 */
export async function listSpaceBots(spaceId: string): Promise<SpaceBot[]> {
	if (!spaceId) return [];
	return invoke<SpaceBot[]>("spaces_list_bots", {
		spaceId,
	});
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
	/** Optional alias the operator typed into the Bots-tab Add form. */
	alias?: string | null;
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
