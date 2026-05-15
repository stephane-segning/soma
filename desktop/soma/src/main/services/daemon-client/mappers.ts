import type {
	DaemonEvent as GrpcDaemonEvent,
	JoinRequest,
	PageRecord,
	Space,
	SpaceMember,
} from "@soma/proto/daemon/v1/daemon";

import type { DaemonStreamEvent, StoredJoinRequest, StoredPage, StoredSpace, StoredSpaceMember } from "./types";

export function fromPageRecord(page: PageRecord): StoredPage {
	return {
		spaceId: page.spaceId,
		pageId: page.pageId,
		title: page.title,
		parentPageIds: page.parentPageIds ?? [],
		createdAtMs: Number(page.createdAtMs ?? Date.now()),
		updatedAtMs: Number(page.updatedAtMs ?? Date.now()),
	};
}

export function fromSpace(space: Space): StoredSpace {
	return {
		spaceId: space.spaceId,
		displayName: space.displayName,
		ownerPeerId: space.ownerPeerId,
		createdAt: Number((space.createdAt as unknown) ?? Date.now()),
	};
}

export function fromSpaceMember(member: SpaceMember): StoredSpaceMember {
	return {
		spaceId: member.spaceId,
		peerId: member.peerId,
		role: member.role,
		expiresAt: Number(member.expiresAt ?? 0),
	};
}

export function fromJoinRequest(request: JoinRequest): StoredJoinRequest {
	return {
		requestId: request.requestId,
		spaceId: request.spaceId,
		subjectPeerId: request.subjectPeerId,
		displayName: request.displayName,
		deviceName: request.deviceName,
		requestedRole: request.requestedRole,
		createdAt: Number(request.createdAt ?? 0),
	};
}

export function mapDaemonEvent(event: GrpcDaemonEvent): DaemonStreamEvent | null {
	if (event.joinDecision) {
		return {
			kind: "join-decision",
			fromPeerId: event.joinDecision.fromPeerId,
			spaceId: event.joinDecision.decision?.spaceId?.value,
		};
	}
	if (event.joinSubmitted) {
		return {
			kind: "join-submitted",
			requestId: event.joinSubmitted.requestId,
			targetPeerId: event.joinSubmitted.targetPeerId,
		};
	}
	if (event.joinFailed) {
		return {
			kind: "join-failed",
			targetPeerId: event.joinFailed.targetPeerId,
			error: event.joinFailed.error,
		};
	}
	if (!event.documentBlobAdded) return null;
	return {
		kind: "document-blob-added",
		spaceId: event.documentBlobAdded.spaceId,
		docId: event.documentBlobAdded.docId,
		cid: event.documentBlobAdded.cid,
		mime: event.documentBlobAdded.mime,
		size: Number(event.documentBlobAdded.size ?? 0),
		name: event.documentBlobAdded.name,
	};
}
