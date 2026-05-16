import type { ReadBlobResponse } from "@soma/proto/daemon/v1/daemon";

import { readBlob, uploadBlob } from "./daemon-client/blobs";
import { createDaemonGrpcClient, type DaemonGrpcClient } from "./daemon-client/connection";
import { getDocument, upsertDocument } from "./daemon-client/documents";
import { streamEvents } from "./daemon-client/events";
import { decideJoin, joinSpace, listJoinRequests, revokeSpaceMembership } from "./daemon-client/joins";
import { ensurePage, listPages, setPageParents, updatePageTitle } from "./daemon-client/pages";
import {
	createSpace,
	deleteSpace,
	getSpace,
	listMyMemberships,
	listSpaceMembers,
	listSpaces,
	updateSpace,
} from "./daemon-client/spaces";
import { status } from "./daemon-client/status";
import type {
	DaemonStatus,
	DaemonStreamHandlers,
	DecideJoinInput,
	DecideJoinResult,
	JoinSpaceInput,
	JoinSpaceResult,
	ListSpacesResult,
	RevokeMembershipInput,
	StoredDocument,
	StoredJoinRequest,
	StoredPage,
	StoredSpace,
	StoredSpaceMember,
	UploadBlobInput,
	UploadBlobResult,
} from "./daemon-client/types";

export * from "./daemon-client/types";

export class DaemonClient {
	private client: DaemonGrpcClient;

	constructor(socketPath: string) {
		this.client = createDaemonGrpcClient(socketPath);
	}

	status(): Promise<DaemonStatus> {
		return status(this.client);
	}

	streamEvents(handlers: DaemonStreamHandlers): () => void {
		return streamEvents(this.client, handlers);
	}

	uploadBlob(input: UploadBlobInput): Promise<UploadBlobResult> {
		return uploadBlob(this.client, input);
	}

	readBlob(spaceId: string, cid: string): Promise<ReadBlobResponse | null> {
		return readBlob(this.client, spaceId, cid);
	}

	upsertDocument(doc: StoredDocument): Promise<void> {
		return upsertDocument(this.client, doc);
	}

	getDocument(spaceId: string, documentId: string): Promise<StoredDocument | null> {
		return getDocument(this.client, spaceId, documentId);
	}

	ensurePage(page: StoredPage): Promise<StoredPage> {
		return ensurePage(this.client, page);
	}

	listPages(spaceId: string): Promise<StoredPage[]> {
		return listPages(this.client, spaceId);
	}

	updatePageTitle(spaceId: string, pageId: string, title: string): Promise<StoredPage | null> {
		return updatePageTitle(this.client, spaceId, pageId, title);
	}

	setPageParents(spaceId: string, pageId: string, parentPageIds: string[]): Promise<StoredPage | null> {
		return setPageParents(this.client, spaceId, pageId, parentPageIds);
	}

	listSpaces(options?: { limit?: number; offset?: number; query?: string }): Promise<ListSpacesResult> {
		return listSpaces(this.client, options);
	}

	createSpace(input: { spaceId?: string; displayName?: string }): Promise<StoredSpace> {
		return createSpace(this.client, input);
	}

	getSpace(spaceId: string): Promise<StoredSpace | null> {
		return getSpace(this.client, spaceId);
	}

	updateSpace(input: { spaceId: string; displayName?: string }): Promise<StoredSpace> {
		return updateSpace(this.client, input);
	}

	deleteSpace(spaceId: string): Promise<boolean> {
		return deleteSpace(this.client, spaceId);
	}

	listSpaceMembers(spaceId: string): Promise<StoredSpaceMember[]> {
		return listSpaceMembers(this.client, spaceId);
	}

	listMyMemberships(): Promise<StoredSpaceMember[]> {
		return listMyMemberships(this.client);
	}

	joinSpace(input: JoinSpaceInput): Promise<JoinSpaceResult> {
		return joinSpace(this.client, input);
	}

	listJoinRequests(): Promise<StoredJoinRequest[]> {
		return listJoinRequests(this.client);
	}

	decideJoin(input: DecideJoinInput): Promise<DecideJoinResult | null> {
		return decideJoin(this.client, input);
	}

	revokeSpaceMembership(input: RevokeMembershipInput): Promise<boolean> {
		return revokeSpaceMembership(this.client, input);
	}
}
