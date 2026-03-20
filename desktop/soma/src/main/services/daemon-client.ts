import * as grpc from "@grpc/grpc-js";
import {
	type DecideJoinResponse,
	type GetDocumentResponse,
	DaemonClient as GrpcDaemonClient,
	type DaemonEvent as GrpcDaemonEvent,
	type JoinRequest,
	type JoinSpaceResponse,
	type ListJoinRequestsResponse,
	type ListMyMembershipsResponse,
	type ListPagesResponse,
	type ListSpacesResponse,
	type PageRecord,
	type ReadBlobResponse,
	type RevokeSpaceResponse,
	type Space,
	type SpaceMember,
	type StatusResponse,
	type StreamEventsRequest,
	type UploadBlobResponse,
} from "@soma/proto/daemon/v1/daemon";
import Long from "long";

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

type ListSpacesResult = {
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

export class DaemonClient {
	private client: GrpcDaemonClient;

	constructor(socketPath: string) {
		const address = `unix://${socketPath}`;
		this.client = new GrpcDaemonClient(address, grpc.credentials.createInsecure());
	}

	async status(): Promise<DaemonStatus> {
		const res = await new Promise<StatusResponse>((resolve, reject) => {
			this.client.status({}, (err, response) => {
				if (err) return reject(err);
				resolve(response);
			});
		});

		return {
			peerId: res.peerId ?? "",
			listenAddrs: res.listenAddrs ?? [],
		};
	}

	streamEvents(handlers: DaemonStreamHandlers): () => void {
		const request: StreamEventsRequest = {};
		const stream = this.client.streamEvents(request);

		stream.on("data", (event: GrpcDaemonEvent) => {
			const mapped = this.mapDaemonEvent(event);
			if (mapped) {
				handlers.onEvent(mapped);
			}
		});

		stream.on("error", (error: Error) => {
			handlers.onError?.(error);
		});

		stream.on("end", () => {
			handlers.onEnd?.();
		});

		return () => {
			stream.cancel();
		};
	}

	async uploadBlob(input: UploadBlobInput): Promise<UploadBlobResult> {
		const res = await new Promise<UploadBlobResponse>((resolve, reject) => {
			this.client.uploadBlob(
				{
					spaceId: input.spaceId,
					data: Buffer.from(input.bytes),
					mime: input.mime,
					name: input.name,
					docId: input.docId ?? "",
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});

		return {
			cid: res.cid,
			size: Number(res.size ?? input.bytes.length),
			mime: res.mime ?? input.mime,
			name: res.name ?? input.name,
		};
	}

	async readBlob(spaceId: string, cid: string): Promise<ReadBlobResponse | null> {
		try {
			const res = await new Promise<ReadBlobResponse>((resolve, reject) => {
				this.client.readBlob(
					{
						spaceId,
						cid,
					},
					(err, response) => {
						if (err) return reject(err);
						resolve(response);
					},
				);
			});
			if (!res?.data || !res.data.length) return null;
			return res;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async upsertDocument(doc: StoredDocument): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			this.client.upsertDocument(
				{
					spaceId: doc.spaceId,
					documentId: doc.documentId,
					contentJson: doc.contentJson,
					published: doc.published,
					updatedAtMs: Long.fromNumber(doc.updatedAtMs),
				},
				(err) => {
					if (err) return reject(err);
					resolve();
				},
			);
		});
	}

	async getDocument(spaceId: string, documentId: string): Promise<StoredDocument | null> {
		try {
			const res = await new Promise<GetDocumentResponse>((resolve, reject) => {
				this.client.getDocument(
					{
						spaceId,
						documentId,
					},
					(err, response) => {
						if (err) return reject(err);
						resolve(response);
					},
				);
			});
			if (!res) return null;
			return {
				spaceId: res.spaceId,
				documentId: res.documentId,
				contentJson: res.contentJson,
				published: !!res.published,
				updatedAtMs: Number(res.updatedAtMs ?? Date.now()),
			};
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async ensurePage(page: StoredPage): Promise<StoredPage> {
		const res = await new Promise<{
			page?: PageRecord;
		}>((resolve, reject) => {
			this.client.ensurePage(
				{
					spaceId: page.spaceId,
					pageId: page.pageId,
					title: page.title,
					parentPageIds: page.parentPageIds,
					createdAtMs: Long.fromNumber(page.createdAtMs),
					updatedAtMs: Long.fromNumber(page.updatedAtMs),
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});
		const p = res.page;
		if (!p) throw new Error("Daemon returned empty page");
		return this.fromPageRecord(p);
	}

	async listPages(spaceId: string): Promise<StoredPage[]> {
		const res = await new Promise<ListPagesResponse>((resolve, reject) => {
			this.client.listPages(
				{
					spaceId,
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});
		return (res.pages ?? []).map((p) => this.fromPageRecord(p));
	}

	async updatePageTitle(spaceId: string, pageId: string, title: string): Promise<StoredPage | null> {
		try {
			const res = await new Promise<{
				page?: PageRecord;
			}>((resolve, reject) => {
				this.client.updatePageTitle(
					{
						spaceId,
						pageId,
						title,
					},
					(err, response) => {
						if (err) return reject(err);
						resolve(response);
					},
				);
			});
			return res.page ? this.fromPageRecord(res.page) : null;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async setPageParents(spaceId: string, pageId: string, parentPageIds: string[]): Promise<StoredPage | null> {
		try {
			const res = await new Promise<{
				page?: PageRecord;
			}>((resolve, reject) => {
				this.client.setPageParents(
					{
						spaceId,
						pageId,
						parentPageIds,
					},
					(err, response) => {
						if (err) return reject(err);
						resolve(response);
					},
				);
			});
			return res.page ? this.fromPageRecord(res.page) : null;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async listSpaces(options?: { limit?: number; offset?: number; query?: string }): Promise<ListSpacesResult> {
		const res = await new Promise<ListSpacesResponse>((resolve, reject) => {
			this.client.listSpaces(
				{
					limit: options?.limit ?? 50,
					offset: options?.offset ?? 0,
					q: options?.query,
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});
		return {
			spaces: (res.spaces ?? []).map((s) => this.fromSpace(s)),
			limit: Number(res.limit ?? options?.limit ?? 50),
			offset: Number(res.offset ?? options?.offset ?? 0),
			nextOffset: res.nextOffset ?? null,
		};
	}

	async createSpace(input: { spaceId?: string; displayName?: string }): Promise<StoredSpace> {
		const res = await new Promise<{
			spaceId: string;
			ownerPeerId: string;
		}>((resolve, reject) => {
			this.client.createSpace(
				{
					spaceId: input.spaceId ?? "",
					displayName: input.displayName ?? "",
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});
		return {
			spaceId: res.spaceId || input.spaceId || "",
			displayName: input.displayName ?? "",
			ownerPeerId: res.ownerPeerId ?? "",
			createdAt: Date.now(),
		};
	}

	async getSpace(spaceId: string): Promise<StoredSpace | null> {
		try {
			const res = await new Promise<{
				space?: Space;
			}>((resolve, reject) => {
				this.client.getSpace(
					{
						spaceId,
					},
					(err, response) => {
						if (err) return reject(err);
						resolve(response);
					},
				);
			});
			return res.space ? this.fromSpace(res.space) : null;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async updateSpace(input: { spaceId: string; displayName?: string }): Promise<StoredSpace> {
		const res = await new Promise<{
			space?: Space;
		}>((resolve, reject) => {
			this.client.updateSpace(
				{
					spaceId: input.spaceId,
					displayName: input.displayName ?? "",
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});
		return this.fromSpace(
			res.space ??
				({
					spaceId: input.spaceId,
					displayName: input.displayName ?? "",
					ownerPeerId: "",
					createdAt: BigInt(Date.now()),
				} as any),
		);
	}

	async deleteSpace(spaceId: string): Promise<boolean> {
		const res = await new Promise<{
			deleted: boolean;
		}>((resolve, reject) => {
			this.client.deleteSpace(
				{
					spaceId,
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});
		return !!res.deleted;
	}

	async listSpaceMembers(spaceId: string): Promise<StoredSpaceMember[]> {
		if (!spaceId) return [];
		const res = await new Promise<{
			members: SpaceMember[];
		}>((resolve, reject) => {
			this.client.listSpaceMembers(
				{
					spaceId,
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});
		return (res.members ?? []).map((m) => ({
			spaceId: m.spaceId,
			peerId: m.peerId,
			role: m.role,
			expiresAt: Number(m.expiresAt ?? 0),
		}));
	}

	async listMyMemberships(): Promise<StoredSpaceMember[]> {
		const res = await new Promise<ListMyMembershipsResponse>((resolve, reject) => {
			this.client.listMyMemberships({}, (err, response) => {
				if (err) return reject(err);
				resolve(response);
			});
		});

		return (res.memberships ?? []).map((m) => ({
			spaceId: m.spaceId,
			peerId: m.peerId,
			role: m.role,
			expiresAt: Number(m.expiresAt ?? 0),
		}));
	}

	async joinSpace(input: JoinSpaceInput): Promise<JoinSpaceResult> {
		if (!input.spaceId?.trim()) {
			throw new Error("spaceId is required");
		}
		if (!input.targetPeerId?.trim()) {
			throw new Error("targetPeerId is required");
		}
		const targetMultiaddrs = (input.targetMultiaddrs ?? [])
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		if (targetMultiaddrs.length === 0) {
			throw new Error("targetMultiaddrs is required");
		}

		const res = await new Promise<JoinSpaceResponse>((resolve, reject) => {
			this.client.joinSpace(
				{
					spaceId: input.spaceId.trim(),
					targetPeerId: input.targetPeerId.trim(),
					targetMultiaddrs,
					displayName: input.displayName?.trim() ?? "",
					deviceName: input.deviceName?.trim() ?? "",
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});

		return {
			requestId: res.requestId,
		};
	}

	async listJoinRequests(): Promise<StoredJoinRequest[]> {
		const res = await new Promise<ListJoinRequestsResponse>((resolve, reject) => {
			this.client.listJoinRequests({}, (err, response) => {
				if (err) return reject(err);
				resolve(response);
			});
		});

		return (res.requests ?? []).map((request) => this.fromJoinRequest(request));
	}

	async decideJoin(input: DecideJoinInput): Promise<DecideJoinResult | null> {
		if (!input.requestId?.trim()) {
			throw new Error("requestId is required");
		}

		const res = await new Promise<DecideJoinResponse>((resolve, reject) => {
			this.client.decideJoin(
				{
					requestId: input.requestId.trim(),
					approve: input.approve,
					role: input.role?.trim() ?? "",
					reason: input.reason?.trim() ?? "",
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});

		const decision = res.decision;
		if (!decision) return null;
		return {
			decisionId: decision.decisionId,
			spaceId: decision.spaceId?.value,
			subjectPeerId: decision.subjectPeerId?.value,
			decision: decision.decision,
			reason: decision.reason,
		};
	}

	async revokeSpaceMembership(input: RevokeMembershipInput): Promise<boolean> {
		if (!input.spaceId?.trim()) {
			throw new Error("spaceId is required");
		}
		if (!input.subjectPeerId?.trim()) {
			throw new Error("subjectPeerId is required");
		}

		const res = await new Promise<RevokeSpaceResponse>((resolve, reject) => {
			this.client.revokeSpace(
				{
					spaceId: input.spaceId.trim(),
					subjectPeerId: input.subjectPeerId.trim(),
					reason: input.reason?.trim() ?? "",
				},
				(err, response) => {
					if (err) return reject(err);
					resolve(response);
				},
			);
		});

		return !!res.accepted;
	}

	private fromPageRecord(p: PageRecord): StoredPage {
		return {
			spaceId: p.spaceId,
			pageId: p.pageId,
			title: p.title,
			parentPageIds: p.parentPageIds ?? [],
			createdAtMs: Number(p.createdAtMs ?? Date.now()),
			updatedAtMs: Number(p.updatedAtMs ?? Date.now()),
		};
	}

	private fromSpace(s: Space): StoredSpace {
		return {
			spaceId: s.spaceId,
			displayName: s.displayName,
			ownerPeerId: s.ownerPeerId,
			createdAt: Number((s.createdAt as any) ?? Date.now()),
		};
	}

	private fromJoinRequest(request: JoinRequest): StoredJoinRequest {
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

	private mapDaemonEvent(event: GrpcDaemonEvent): DaemonStreamEvent | null {
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
		// Prefer document_blob_added; fall back to legacy yoopta_blob_added for compatibility.
		if (event.documentBlobAdded) {
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
		if (event.yooptaBlobAdded) {
			return {
				kind: "document-blob-added",
				spaceId: event.yooptaBlobAdded.spaceId,
				docId: event.yooptaBlobAdded.docId,
				cid: event.yooptaBlobAdded.cid,
				mime: event.yooptaBlobAdded.mime,
				size: Number(event.yooptaBlobAdded.size ?? 0),
				name: event.yooptaBlobAdded.name,
			};
		}
		return null;
	}
}
