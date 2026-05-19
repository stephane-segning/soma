import type {
	DaemonClient,
	DecideJoinInput,
	DecideJoinResult,
	IssueIssuerCapabilityInput,
	JoinSpaceInput,
	JoinSpaceResult,
	RevokeMembershipInput,
	StoredJoinRequest,
	StoredSpace,
	StoredSpaceMember,
} from "../services/daemon-client";

export type ListSpacesResult = {
	spaces: StoredSpace[];
	limit: number;
	offset: number;
	nextOffset?: number | null;
};

export class SpacesController {
	constructor(private readonly daemon: DaemonClient) {}

	list(input?: { limit?: number; offset?: number; q?: string }): Promise<ListSpacesResult> {
		return this.daemon.listSpaces({
			limit: input?.limit,
			offset: input?.offset,
			query: input?.q,
		});
	}

	create(input: { spaceId?: string; displayName?: string }): Promise<StoredSpace> {
		return this.daemon.createSpace(input);
	}

	get(spaceId: string): Promise<StoredSpace | null> {
		return this.daemon.getSpace(spaceId);
	}

	update(input: { spaceId: string; displayName?: string }): Promise<StoredSpace> {
		return this.daemon.updateSpace(input);
	}

	delete(spaceId: string): Promise<boolean> {
		return this.daemon.deleteSpace(spaceId);
	}

	listMembers(spaceId: string): Promise<StoredSpaceMember[]> {
		return this.daemon.listSpaceMembers(spaceId);
	}

	listBots(spaceId: string): Promise<StoredSpaceMember[]> {
		return this.daemon.listSpaceBots(spaceId);
	}

	listMyMemberships(): Promise<StoredSpaceMember[]> {
		return this.daemon.listMyMemberships();
	}

	join(input: JoinSpaceInput): Promise<JoinSpaceResult> {
		return this.daemon.joinSpace(input);
	}

	listJoinRequests(): Promise<StoredJoinRequest[]> {
		return this.daemon.listJoinRequests();
	}

	decideJoin(input: DecideJoinInput): Promise<DecideJoinResult | null> {
		return this.daemon.decideJoin(input);
	}

	revokeMembership(input: RevokeMembershipInput): Promise<boolean> {
		return this.daemon.revokeSpaceMembership(input);
	}

	issueIssuerCapability(input: IssueIssuerCapabilityInput): Promise<boolean> {
		return this.daemon.issueIssuerCapability(input);
	}
}
