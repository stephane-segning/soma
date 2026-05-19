export type ReadBlobResponse = {
	data: Uint8Array;
	mime: string;
	size: number;
};

export type UploadBlobInput = {
	spaceId: string;
	docId?: string;
	mime: string;
	name: string;
	bytes: number[];
};

export type UploadBlobResult = {
	cid: string;
	size: number;
	mime: string;
	name: string;
};

export type StoredDocument = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
	updatedAtMs: number;
};

export type StoredPage = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
};

export type StoredSpace = {
	spaceId: string;
	displayName: string;
	ownerPeerId: string;
	createdAt: number;
};

export type StoredSpaceMember = {
	spaceId: string;
	peerId: string;
	role: string;
	expiresAt: number;
};

export type StoredBotStatus = "pending" | "active" | "failed" | "expired";

export type StoredSpaceBot = {
	spaceId: string;
	peerId: string;
	expiresAt: number;
	alias: string | null;
	status: StoredBotStatus;
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

export type StoredJoinRequest = {
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

export type IssueIssuerCapabilityInput = {
	spaceId: string;
	targetPeerId: string;
	/** Absolute expiry in milliseconds since the unix epoch. */
	expiresAt: number;
	/** Optional human alias for the Bots-tab list view. */
	alias?: string | null;
};

export type ListSpacesResult = {
	spaces: StoredSpace[];
	limit: number;
	offset: number;
	nextOffset?: number | null;
};

export type DaemonStatus = {
	peerId: string;
	listenAddrs: string[];
};

export type DaemonStreamEvent =
	| {
			kind: "join-decision";
			fromPeerId: string;
			spaceId?: string;
	  }
	| {
			kind: "join-submitted";
			requestId: string;
			targetPeerId: string;
	  }
	| {
			kind: "join-failed";
			targetPeerId: string;
			error: string;
	  }
	| {
			kind: "document-blob-added";
			spaceId: string;
			docId: string;
			cid: string;
			mime: string;
			size: number;
			name: string;
	  };

export type DaemonStreamHandlers = {
	onEvent: (event: DaemonStreamEvent) => void;
	onError?: (error: Error) => void;
	onEnd?: () => void;
};
