/**
 * Renderer-side spaces service. Thin adapter over `@soma/sdk` — no
 * channel-name strings live here anymore; the SDK owns those. Local
 * types are re-exported from the SDK so the rest of the renderer keeps
 * using `Space`, `SpaceMember`, etc. without imports leaking.
 */

import type {
	DecideJoinArgs,
	DecideJoinResult as SdkDecideJoinResult,
	IssueIssuerCapabilityArgs,
	JoinSpaceArgs,
	JoinSpaceResult,
	ListSpacesResult as SdkListSpacesResult,
	RevokeMemberArgs,
	StoredJoinRequest,
	StoredSpace,
	StoredSpaceBot,
	StoredSpaceMember,
} from "@soma/sdk";
import { backend } from "../lib/ipc";

export type Space = StoredSpace;
export type SpaceMember = StoredSpaceMember;
export type JoinSpaceInput = JoinSpaceArgs;
export type { JoinSpaceResult };
export type JoinRequestRecord = StoredJoinRequest;
export type DecideJoinInput = DecideJoinArgs;
export type DecideJoinResult = SdkDecideJoinResult;
export type RevokeMembershipInput = RevokeMemberArgs;
export type ListSpacesResult = SdkListSpacesResult;
/**
 * Daemon-side `status` is an open `string` — it lets the storage layer
 * forward unknown labels without a TS update. The renderer narrows back
 * to a union here so quick-action UIs can `switch` exhaustively.
 */
export type SpaceBotStatus = "pending" | "active" | "failed" | "expired";

export type SpaceBot = Omit<StoredSpaceBot, "status"> & { status: SpaceBotStatus };
export type IssueIssuerCapabilityInput = IssueIssuerCapabilityArgs;

export async function listSpaces(params?: {
	limit?: number;
	offset?: number;
	query?: string;
}): Promise<ListSpacesResult> {
	// `limit` / `offset` are intentionally omitted when the caller doesn't
	// supply them so the backend applies its own default page size (50).
	// Sending `limit: 0` would *bypass* that default — the Rust handler
	// clamps `0` to `1` and returns a single space.
	return backend.spaces.list({
		q: params?.query ?? null,
		...(params?.limit !== undefined ? { limit: params.limit } : {}),
		...(params?.offset !== undefined ? { offset: params.offset } : {}),
	});
}

export async function createSpace(input: { spaceId?: string; displayName?: string }): Promise<Space> {
	return backend.spaces.create({
		spaceId: input.spaceId ?? null,
		displayName: input.displayName ?? null,
	});
}

export async function getSpace(spaceId: string): Promise<Space> {
	return backend.spaces.get(spaceId);
}

export async function listSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
	if (!spaceId) return [];
	return backend.spaces.members(spaceId).catch(() => []);
}

/**
 * Bot list flavor of {@link listSpaceMembers}. Unlike `listSpaceMembers`,
 * this *does not* swallow IPC errors — the RTK Query wrapping this call
 * in `accessApi.listSpaceBots` catches rejection and routes it into
 * `query.error`, which `useSpaceBots` surfaces as `loadError`. Eating
 * errors here would hide daemon-connectivity failures behind a
 * permanent empty state.
 */
export async function listSpaceBots(spaceId: string): Promise<SpaceBot[]> {
	if (!spaceId) return [];
	// SDK types `status` as `string` for forward-compat with future
	// daemon-side states; the renderer narrows here for switch-exhaustiveness.
	return (await backend.spaces.bots(spaceId)) as SpaceBot[];
}

export async function listMyMemberships(): Promise<SpaceMember[]> {
	return backend.spaces.myMemberships().catch(() => []);
}

export async function joinSpace(input: JoinSpaceInput): Promise<JoinSpaceResult> {
	return backend.spaces.join(input);
}

export async function listJoinRequests(): Promise<JoinRequestRecord[]> {
	return backend.spaces.joinRequests().catch(() => []);
}

export async function decideJoin(input: DecideJoinInput): Promise<DecideJoinResult | null> {
	return backend.spaces.decideJoin(input).catch(() => null);
}

export async function revokeMembership(input: RevokeMembershipInput): Promise<boolean> {
	return backend.spaces.revokeMember(input).catch(() => false);
}

export async function issueIssuerCapability(input: IssueIssuerCapabilityInput): Promise<boolean> {
	return backend.spaces.issueIssuerCapability(input);
}

/**
 * Rename a space. `displayName` is **required** — the SDK + daemon
 * treat this as a full update of that field, so silently defaulting a
 * missing name to `""` would wipe the existing one. Partial updates
 * that only touch other fields belong on a future `patch` endpoint.
 */
export async function updateSpace(input: { spaceId: string; displayName: string }): Promise<Space> {
	return backend.spaces.update({
		spaceId: input.spaceId,
		displayName: input.displayName,
	});
}

export async function deleteSpace(spaceId: string): Promise<boolean> {
	return backend.spaces.delete(spaceId);
}
