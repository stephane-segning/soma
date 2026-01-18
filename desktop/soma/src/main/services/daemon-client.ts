import fs from "fs";
import * as grpc from "@grpc/grpc-js";
import {
	DaemonClient as GrpcDaemonClient,
	type GetDocumentResponse,
	type ListPagesResponse,
	type ListSpacesResponse,
	type PageRecord,
	type ReadBlobResponse,
	type Space,
	type SpaceMember,
	type UploadBlobResponse,
} from "@soma/proto/daemon/v1/daemon";
import { AppDataStore, type StoredBlob } from "./app-data-store";

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

type ListSpacesResult = {
	spaces: StoredSpace[];
	limit: number;
	offset: number;
	nextOffset?: number | null;
};

const DAEMON_SOCKET = process.env.SOMA_DAEMON_SOCKET || "/tmp/soma-daemon.sock";

export class DaemonClient {
	private client: GrpcDaemonClient;

	constructor(private readonly store: AppDataStore) {
		const address = `unix://${DAEMON_SOCKET}`;
		this.client = new GrpcDaemonClient(
			address,
			grpc.credentials.createInsecure(),
		);
	}

	private unary<TResponse>(
		method: keyof GrpcDaemonClient,
		payload: unknown,
	): Promise<TResponse> {
		return new Promise((resolve, reject) => {
			const fn = (this.client[method] as any)?.bind(this.client);
			if (!fn)
				return reject(new Error(`Daemon method not found: ${String(method)}`));
			fn(payload, (err: grpc.ServiceError | null, res: TResponse) => {
				if (err) return reject(err);
				resolve(res);
			});
		});
	}

	async uploadBlob(input: UploadBlobInput): Promise<UploadBlobResult> {
		const res = await this.unary<UploadBlobResponse>("uploadBlob", {
			spaceId: input.spaceId,
			data: Buffer.from(input.bytes),
			mime: input.mime,
			name: input.name,
			docId: input.docId ?? "",
		});

		await this.store.persistBlobBytes(
			input.spaceId,
			res.cid,
			Buffer.from(input.bytes),
		);
		const record: StoredBlob = {
			cid: res.cid,
			spaceId: input.spaceId,
			docId: input.docId,
			mime: res.mime ?? input.mime,
			name: res.name ?? input.name,
			size: Number(res.size ?? input.bytes.length),
			createdAtMs: Date.now(),
		};
		this.store.blobs = [
			...this.store.blobs.filter((b) => b.cid !== record.cid),
			record,
		];

		return {
			cid: res.cid,
			size: Number(res.size ?? input.bytes.length),
			mime: res.mime ?? input.mime,
			name: res.name ?? input.name,
		};
	}

	async readBlob(spaceId: string, cid: string): Promise<Buffer | null> {
		const cachedPath = this.store.getBlobPath(spaceId, cid);
		try {
			const bytes = await fs.promises.readFile(cachedPath);
			return bytes;
		} catch {
			// fetch from daemon
		}

		try {
			const res = await this.unary<ReadBlobResponse>("readBlob", {
				spaceId,
				cid,
			});
			if (!res?.data || !res.data.length) return null;
			const data = Buffer.from(res.data);
			await this.store.persistBlobBytes(spaceId, cid, data);
			return data;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async upsertDocument(doc: StoredDocument): Promise<void> {
		await this.unary("upsertDocument", {
			spaceId: doc.spaceId,
			documentId: doc.documentId,
			contentJson: doc.contentJson,
			published: doc.published,
			updatedAtMs: doc.updatedAtMs,
		});
	}

	async getDocument(
		spaceId: string,
		documentId: string,
	): Promise<StoredDocument | null> {
		try {
			const res = await this.unary<GetDocumentResponse>("getDocument", {
				spaceId,
				documentId,
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
		const res = await this.unary<{ page?: PageRecord }>("ensurePage", {
			spaceId: page.spaceId,
			pageId: page.pageId,
			title: page.title,
			parentPageIds: page.parentPageIds,
			createdAtMs: page.createdAtMs,
			updatedAtMs: page.updatedAtMs,
		});
		const p = res.page;
		if (!p) throw new Error("Daemon returned empty page");
		return this.fromPageRecord(p);
	}

	async listPages(spaceId: string): Promise<StoredPage[]> {
		const res = await this.unary<ListPagesResponse>("listPages", { spaceId });
		return (res.pages ?? []).map((p) => this.fromPageRecord(p));
	}

	async updatePageTitle(
		spaceId: string,
		pageId: string,
		title: string,
	): Promise<StoredPage | null> {
		try {
			const res = await this.unary<{ page?: PageRecord }>("updatePageTitle", {
				spaceId,
				pageId,
				title,
			});
			return res.page ? this.fromPageRecord(res.page) : null;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async setPageParents(
		spaceId: string,
		pageId: string,
		parentPageIds: string[],
	): Promise<StoredPage | null> {
		try {
			const res = await this.unary<{ page?: PageRecord }>("setPageParents", {
				spaceId,
				pageId,
				parentPageIds,
			});
			return res.page ? this.fromPageRecord(res.page) : null;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async listSpaces(options?: {
		limit?: number;
		offset?: number;
		query?: string;
	}): Promise<ListSpacesResult> {
		const res = await this.unary<ListSpacesResponse>("listSpaces", {
			limit: options?.limit ?? 50,
			offset: options?.offset ?? 0,
			q: options?.query,
		});
		return {
			spaces: (res.spaces ?? []).map((s) => this.fromSpace(s)),
			limit: Number(res.limit ?? options?.limit ?? 50),
			offset: Number(res.offset ?? options?.offset ?? 0),
			nextOffset: res.nextOffset ?? null,
		};
	}

	async createSpace(input: {
		spaceId?: string;
		displayName?: string;
	}): Promise<StoredSpace> {
		const res = await this.unary<{ spaceId: string; ownerPeerId: string }>(
			"createSpace",
			{
				spaceId: input.spaceId ?? "",
				displayName: input.displayName ?? "",
			},
		);
		return {
			spaceId: res.spaceId || input.spaceId || "",
			displayName: input.displayName ?? "",
			ownerPeerId: res.ownerPeerId ?? "",
			createdAt: Date.now(),
		};
	}

	async getSpace(spaceId: string): Promise<StoredSpace | null> {
		try {
			const res = await this.unary<{ space?: Space }>("getSpace", { spaceId });
			return res.space ? this.fromSpace(res.space) : null;
		} catch (error: any) {
			if (error?.code === grpc.status.NOT_FOUND) return null;
			throw error;
		}
	}

	async updateSpace(input: {
		spaceId: string;
		displayName?: string;
	}): Promise<StoredSpace> {
		const res = await this.unary<{ space?: Space }>("updateSpace", {
			spaceId: input.spaceId,
			displayName: input.displayName ?? "",
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
		const res = await this.unary<{ deleted: boolean }>("deleteSpace", {
			spaceId,
		});
		return !!res.deleted;
	}

	async listSpaceMembers(spaceId: string): Promise<StoredSpaceMember[]> {
		if (!spaceId) return [];
		const res = await this.unary<{ members: SpaceMember[] }>(
			"listSpaceMembers",
			{ spaceId },
		);
		return (res.members ?? []).map((m) => ({
			spaceId: m.spaceId,
			peerId: m.peerId,
			role: m.role,
			expiresAt: Number(m.expiresAt ?? 0),
		}));
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
}
