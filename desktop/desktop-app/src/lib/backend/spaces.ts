import { call } from "./client";
import type {
	CreateSpaceArgs,
	DecideJoinArgs,
	DecideJoinResult,
	JoinSpaceArgs,
	JoinSpaceResult,
	ListSpacesArgs,
	ListSpacesResult,
	StoredSpace,
	StoredSpaceMember,
} from "./types";

export const spaces = {
	list: (args: ListSpacesArgs = {}) => call<ListSpacesResult>("list_spaces", { args }),
	create: (args: CreateSpaceArgs) => call<StoredSpace>("create_space", { args }),
	get: (spaceId: string) => call<StoredSpace>("get_space", { spaceId }),
	update: (args: CreateSpaceArgs) => call<StoredSpace>("update_space", { args }),
	delete: (spaceId: string) => call<boolean>("delete_space", { spaceId }),
	members: (spaceId: string) => call<StoredSpaceMember[]>("list_space_members", { spaceId }),
	myMemberships: () => call<StoredSpaceMember[]>("list_my_memberships"),
	join: (args: JoinSpaceArgs) => call<JoinSpaceResult>("join_space", { args }),
	decideJoin: (args: DecideJoinArgs) => call<DecideJoinResult>("decide_join", { args }),
};
