import type * as B from "../bindings";
import type { Transport } from "../transport";

export function spaces(t: Transport) {
	return {
		list: (args: B.ListSpacesArgs | null = null) => t.invoke<B.ListSpacesResult>("spaces_list", { args }),
		create: (args: B.CreateSpaceArgs | null = null) => t.invoke<B.StoredSpace>("spaces_create", { args }),
		get: (spaceId: string) => t.invoke<B.StoredSpace>("spaces_get", { spaceId }),
		update: (args: B.UpdateSpaceArgs) => t.invoke<B.StoredSpace>("spaces_update", { args }),
		delete: (spaceId: string) => t.invoke<boolean>("spaces_delete", { spaceId }),
		members: (spaceId: string) => t.invoke<B.StoredSpaceMember[]>("spaces_list_members", { spaceId }),
		myMemberships: () => t.invoke<B.StoredSpaceMember[]>("spaces_list_my_memberships"),
		bots: (spaceId: string) => t.invoke<B.StoredSpaceBot[]>("spaces_list_bots", { spaceId }),
		join: (args: B.JoinSpaceArgs) => t.invoke<B.JoinSpaceResult>("spaces_join", { args }),
		decideJoin: (args: B.DecideJoinArgs) => t.invoke<B.DecideJoinResult>("spaces_decide_join", { args }),
		joinRequests: () => t.invoke<B.StoredJoinRequest[]>("spaces_list_join_requests"),
		revokeMember: (args: B.RevokeMemberArgs) => t.invoke<boolean>("spaces_revoke_member", { args }),
		issueIssuerCapability: (args: B.IssueIssuerCapabilityArgs) =>
			t.invoke<boolean>("spaces_issue_issuer_capability", { args }),
	};
}
