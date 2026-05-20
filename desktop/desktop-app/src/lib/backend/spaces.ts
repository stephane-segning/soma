import { call } from "./client";
import type {
	CreateSpaceArgs,
	DecideJoinArgs,
	DecideJoinResult,
	IssueIssuerCapabilityArgs,
	JoinSpaceArgs,
	JoinSpaceResult,
	ListSpacesArgs,
	ListSpacesResult,
	RevokeMemberArgs,
	StoredJoinRequest,
	StoredSpace,
	StoredSpaceBot,
	StoredSpaceMember,
} from "./types";

export const spaces = {
	list: (args: ListSpacesArgs = {}) => call<ListSpacesResult>("spaces_list", { args }),
	create: (args: CreateSpaceArgs = {}) => call<StoredSpace>("spaces_create", { args }),
	get: (spaceId: string) => call<StoredSpace>("spaces_get", { spaceId }),
	update: (args: { spaceId: string; displayName: string }) => call<StoredSpace>("spaces_update", { args }),
	delete: (spaceId: string) => call<boolean>("spaces_delete", { spaceId }),
	members: (spaceId: string) => call<StoredSpaceMember[]>("spaces_list_members", { spaceId }),
	myMemberships: () => call<StoredSpaceMember[]>("spaces_list_my_memberships"),
	bots: (spaceId: string) => call<StoredSpaceBot[]>("spaces_list_bots", { spaceId }),
	join: (args: JoinSpaceArgs) => call<JoinSpaceResult>("spaces_join", { args }),
	decideJoin: (args: DecideJoinArgs) => call<DecideJoinResult>("spaces_decide_join", { args }),
	joinRequests: () => call<StoredJoinRequest[]>("spaces_list_join_requests"),
	revokeMember: (args: RevokeMemberArgs) => call<boolean>("spaces_revoke_member", { args }),
	issueIssuerCapability: (args: IssueIssuerCapabilityArgs) => call<boolean>("spaces_issue_issuer_capability", { args }),
};
