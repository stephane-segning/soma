import type { DaemonEventJs } from "@soma/node";

import type { AddonRuntime } from "./addon-runtime";
import type {
	DaemonStatus,
	DaemonStreamEvent,
	DaemonStreamHandlers,
	DecideJoinInput,
	DecideJoinResult,
	IssueIssuerCapabilityInput,
	JoinSpaceInput,
	JoinSpaceResult,
	ListSpacesResult,
	ReadBlobResponse,
	RevokeMembershipInput,
	StoredDocument,
	StoredJoinRequest,
	StoredPage,
	StoredSpace,
	StoredSpaceMember,
	UploadBlobInput,
	UploadBlobResult,
} from "./daemon-client/types";
import type { AppLogger } from "./logger";

export * from "./daemon-client/types";

/**
 * Facade over the `@soma/node` napi handle. Keeps the historical
 * `DaemonClient` public interface so controllers don't need to change.
 *
 * The handle is lazily resolved per-call so the renderer can issue commands
 * before the `AddonRuntime` has finished starting (callers `await` it anyway).
 */
export class DaemonClient {
	constructor(
		private readonly runtime: AddonRuntime,
		private readonly logger?: AppLogger,
	) {}

	async status(): Promise<DaemonStatus> {
		const handle = await this.handle();
		const res = await handle.status();
		return {
			peerId: res.peerId ?? "",
			listenAddrs: res.listenAddrs ?? [],
		};
	}

	/**
	 * Subscribe to the daemon event firehose via the napi addon's
	 * `subscribeEvents`. Translates the flat `DaemonEventJs` records napi
	 * emits into the discriminated `DaemonStreamEvent` shape callers expect.
	 * The returned function unsubscribes (aborts the Rust-side translator
	 * task; safe to call multiple times).
	 *
	 * Errors raised by the napi callback are surfaced through
	 * `handlers.onError`; the subscription itself never throws.
	 */
	streamEvents(handlers: DaemonStreamHandlers): () => void {
		let subscription: { unsubscribe(): Promise<void> } | null = null;
		let cancelled = false;

		const cancel = () => {
			cancelled = true;
			void subscription?.unsubscribe();
			subscription = null;
		};

		const surface = (error: unknown, where: string) => {
			if (cancelled) return;
			const err = error instanceof Error ? error : new Error(String(error));
			// Always trace — so errors are visible even when no onError handler
			// is provided — then forward to the caller's handler if present.
			this.logger?.log("warn", `daemon stream events ${where}`, { error: err.message });
			handlers.onError?.(err);
		};

		void (async () => {
			try {
				const handle = await this.handle();
				if (cancelled) return;
				subscription = await handle.subscribeEvents((event) => {
					try {
						const mapped = mapDaemonEvent(event);
						if (mapped) handlers.onEvent(mapped);
					} catch (error) {
						surface(error, "callback failed");
					}
				});
				if (cancelled) {
					void subscription.unsubscribe();
					subscription = null;
				}
			} catch (error) {
				surface(error, "subscribe failed");
			}
		})();

		return cancel;
	}

	async uploadBlob(input: UploadBlobInput): Promise<UploadBlobResult> {
		const handle = await this.handle();
		const res = await handle.uploadBlob({
			spaceId: input.spaceId,
			data: Buffer.from(input.bytes),
			mime: input.mime,
			name: input.name,
			docId: input.docId ?? "",
		});
		return {
			cid: res.cid,
			size: Number(res.size ?? input.bytes.length),
			mime: res.mime ?? input.mime,
			name: res.name ?? input.name,
		};
	}

	async readBlob(spaceId: string, cid: string): Promise<ReadBlobResponse | null> {
		const handle = await this.handle();
		const res = await handle.readBlob(spaceId, cid);
		if (!res?.data || !res.data.length) return null;
		// Addon returns { data: Buffer, size, mime } — historical `ReadBlobResponse`
		// matches this shape (data + mime are the only fields touched by callers).
		return {
			data: res.data,
			mime: res.mime ?? "",
			size: Number(res.size ?? res.data.length),
		};
	}

	async upsertDocument(doc: StoredDocument): Promise<void> {
		const handle = await this.handle();
		await handle.upsertDocument({
			spaceId: doc.spaceId,
			documentId: doc.documentId,
			contentJson: doc.contentJson,
			published: doc.published,
			updatedAtMs: doc.updatedAtMs,
		});
	}

	async getDocument(spaceId: string, documentId: string): Promise<StoredDocument | null> {
		const handle = await this.handle();
		const res = await handle.getDocument(spaceId, documentId);
		if (!res) return null;
		return {
			spaceId: res.spaceId,
			documentId: res.documentId,
			contentJson: res.contentJson,
			published: !!res.published,
			updatedAtMs: Number(res.updatedAtMs ?? Date.now()),
		};
	}

	async ensurePage(page: StoredPage): Promise<StoredPage> {
		const handle = await this.handle();
		const res = await handle.ensurePage({
			spaceId: page.spaceId,
			pageId: page.pageId,
			title: page.title,
			parentPageIds: page.parentPageIds,
			createdAtMs: page.createdAtMs,
			updatedAtMs: page.updatedAtMs,
		});
		return mapPage(res);
	}

	async listPages(spaceId: string): Promise<StoredPage[]> {
		const handle = await this.handle();
		const res = await handle.listPages(spaceId);
		return (res ?? []).map((page) => mapPage(page));
	}

	async updatePageTitle(spaceId: string, pageId: string, title: string): Promise<StoredPage | null> {
		const handle = await this.handle();
		const res = await handle.updatePageTitle(spaceId, pageId, title);
		return res ? mapPage(res) : null;
	}

	async setPageParents(spaceId: string, pageId: string, parentPageIds: string[]): Promise<StoredPage | null> {
		const handle = await this.handle();
		const res = await handle.setPageParents(spaceId, pageId, parentPageIds);
		return res ? mapPage(res) : null;
	}

	async listSpaces(options?: { limit?: number; offset?: number; query?: string }): Promise<ListSpacesResult> {
		const handle = await this.handle();
		const res = await handle.listSpaces({
			limit: options?.limit ?? 50,
			offset: options?.offset ?? 0,
			q: options?.query,
		});
		return {
			spaces: (res.spaces ?? []).map((space) => mapSpace(space)),
			limit: Number(res.limit ?? options?.limit ?? 50),
			offset: Number(res.offset ?? options?.offset ?? 0),
			nextOffset: res.nextOffset ?? null,
		};
	}

	async createSpace(input: { spaceId?: string; displayName?: string }): Promise<StoredSpace> {
		const handle = await this.handle();
		const res = await handle.createSpace({
			spaceId: input.spaceId ?? "",
			displayName: input.displayName ?? "",
		});
		return {
			spaceId: res.spaceId || input.spaceId || "",
			displayName: input.displayName ?? "",
			ownerPeerId: res.ownerPeerId ?? "",
			createdAt: Date.now(),
		};
	}

	async getSpace(spaceId: string): Promise<StoredSpace | null> {
		const handle = await this.handle();
		try {
			const res = await handle.getSpace(spaceId);
			return res ? mapSpace(res) : null;
		} catch (error) {
			if (isNotFound(error)) return null;
			throw error;
		}
	}

	async updateSpace(input: { spaceId: string; displayName?: string }): Promise<StoredSpace> {
		const handle = await this.handle();
		const res = await handle.updateSpace({
			spaceId: input.spaceId,
			displayName: input.displayName ?? "",
		});
		// Trust the addon. Fabricating a synthetic record with
		// `createdAt: Date.now()` would lie about the original creation
		// timestamp and corrupt downstream caches; let the caller see the
		// addon's actual error if the update didn't yield a record.
		if (!res) {
			throw new Error(`updateSpace returned no record for spaceId=${input.spaceId}`);
		}
		return mapSpace(res);
	}

	async deleteSpace(spaceId: string): Promise<boolean> {
		const handle = await this.handle();
		return !!(await handle.deleteSpace(spaceId));
	}

	async listSpaceMembers(spaceId: string): Promise<StoredSpaceMember[]> {
		if (!spaceId) return [];
		const handle = await this.handle();
		const res = await handle.listSpaceMembers(spaceId);
		return (res ?? []).map((member) => mapMember(member));
	}

	async listMyMemberships(): Promise<StoredSpaceMember[]> {
		const handle = await this.handle();
		const res = await handle.listMyMemberships();
		return (res ?? []).map((member) => mapMember(member));
	}

	async joinSpace(input: JoinSpaceInput): Promise<JoinSpaceResult> {
		if (!input.spaceId?.trim()) throw new Error("spaceId is required");
		if (!input.targetPeerId?.trim()) throw new Error("targetPeerId is required");
		const targetMultiaddrs = (input.targetMultiaddrs ?? [])
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		if (targetMultiaddrs.length === 0) throw new Error("targetMultiaddrs is required");

		const handle = await this.handle();
		const requestId = await handle.joinSpace({
			spaceId: input.spaceId.trim(),
			displayName: input.displayName?.trim() ?? "",
			deviceName: input.deviceName?.trim() ?? "",
			targetPeerId: input.targetPeerId.trim(),
			targetMultiaddrs,
		});
		return { requestId };
	}

	async listJoinRequests(): Promise<StoredJoinRequest[]> {
		const handle = await this.handle();
		const res = await handle.listJoinRequests();
		return (res ?? []).map((request) => ({
			requestId: request.requestId,
			spaceId: request.spaceId,
			subjectPeerId: request.subjectPeerId,
			displayName: request.displayName,
			deviceName: request.deviceName,
			requestedRole: request.requestedRole,
			createdAt: Number(request.createdAt ?? 0),
		}));
	}

	/**
	 * The legacy grpc decideJoin returned `DecideJoinResult | null` (null when
	 * the daemon had no decision to report). The addon now always returns a
	 * `JoinDecisionRecordJs`, so we always map to a non-null result. Callers
	 * already treat the value as "decision recorded" — see
	 * `command-registry/space-handlers.ts`.
	 */
	async decideJoin(input: DecideJoinInput): Promise<DecideJoinResult | null> {
		if (!input.requestId?.trim()) throw new Error("requestId is required");
		const handle = await this.handle();
		const res = await handle.decideJoin({
			requestId: input.requestId.trim(),
			approve: input.approve,
			role: input.role?.trim() ?? "",
			reason: input.reason?.trim() ?? "",
		});
		return {
			decisionId: res.decisionId,
			spaceId: res.spaceId,
			subjectPeerId: res.subjectPeerId,
			decision: res.decision,
			reason: res.reason,
		};
	}

	async revokeSpaceMembership(input: RevokeMembershipInput): Promise<boolean> {
		if (!input.spaceId?.trim()) throw new Error("spaceId is required");
		if (!input.subjectPeerId?.trim()) throw new Error("subjectPeerId is required");
		const handle = await this.handle();
		return !!(await handle.revokeSpace({
			spaceId: input.spaceId.trim(),
			subjectPeerId: input.subjectPeerId.trim(),
			reason: input.reason?.trim() ?? "",
		}));
	}

	async issueIssuerCapability(input: IssueIssuerCapabilityInput): Promise<boolean> {
		if (!input.spaceId?.trim()) throw new Error("spaceId is required");
		if (!input.targetPeerId?.trim()) throw new Error("targetPeerId is required");
		if (!Number.isFinite(input.expiresAt) || input.expiresAt < 0) {
			throw new Error(
				"expiresAt must be non-negative epoch-ms (0 = no expiry)",
			);
		}
		// The Rust daemon treats `expires_at` as epoch *seconds* (see
		// `daemon::handle::issuer::issue_issuer_capability` — it builds
		// `SystemTime::now().as_secs()` and compares against the value).
		// JS callers stay in native epoch-ms; we convert here. `0` keeps
		// the daemon's "no expiry" path.
		const expiresAtSecs =
			input.expiresAt === 0 ? 0 : Math.floor(input.expiresAt / 1000);
		const handle = await this.handle();
		return !!(await handle.issueIssuerCapability({
			spaceId: input.spaceId.trim(),
			targetPeerId: input.targetPeerId.trim(),
			expiresAt: expiresAtSecs,
		}));
	}

	private async handle() {
		// `AddonRuntime.start()` is idempotent — returns the cached handle if
		// already started, otherwise starts and caches.
		return this.runtime.start();
	}
}

function mapSpace(space: {
	spaceId: string;
	displayName: string;
	ownerPeerId: string;
	createdAt: number;
}): StoredSpace {
	return {
		spaceId: space.spaceId,
		displayName: space.displayName,
		ownerPeerId: space.ownerPeerId,
		createdAt: Number(space.createdAt ?? Date.now()),
	};
}

function mapMember(member: { spaceId: string; peerId: string; role: string; expiresAt: number }): StoredSpaceMember {
	return {
		spaceId: member.spaceId,
		peerId: member.peerId,
		role: member.role,
		expiresAt: Number(member.expiresAt ?? 0),
	};
}

function mapPage(page: {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
}): StoredPage {
	return {
		spaceId: page.spaceId,
		pageId: page.pageId,
		title: page.title,
		parentPageIds: page.parentPageIds ?? [],
		createdAtMs: Number(page.createdAtMs ?? Date.now()),
		updatedAtMs: Number(page.updatedAtMs ?? Date.now()),
	};
}

/**
 * Best-effort check for "this record doesn't exist" so the daemon-client
 * facade can return `null` instead of propagating the error to callers that
 * model absence as `null`.
 *
 * The @soma/node addon currently surfaces these as generic JS errors with a
 * string message — no typed/error-coded surface yet. The patterns here match
 * the exact phrases the daemon's handle layer emits (see
 * `backend/crates/daemon/src/handle/*.rs`), anchored with word boundaries to
 * avoid matching unrelated strings like "configuration file not found".
 *
 * TODO(phase-5): once @soma/node exposes typed errors / codes, switch this
 * check to `error.code === "NOT_FOUND"` and drop the regex.
 */
function isNotFound(error: unknown): boolean {
	if (!error) return false;
	const message = error instanceof Error ? error.message : String(error);
	// Anchored matches for the actual daemon-layer error strings.
	return /\b(?:space|page|document|blob|membership)\s+not\s+found\b/i.test(message);
}

/**
 * Translate the flat `DaemonEventJs` napi emits into the discriminated
 * `DaemonStreamEvent` union the rest of the codebase consumes. Unknown
 * kinds are silently dropped — addon and TS can roll out a new event in
 * either order.
 */
function mapDaemonEvent(event: DaemonEventJs): DaemonStreamEvent | null {
	switch (event.kind) {
		case "document-blob-added":
			return {
				kind: "document-blob-added",
				spaceId: event.spaceId,
				docId: event.docId,
				cid: event.cid,
				mime: event.mime,
				size: Number(event.size),
				name: event.name,
			};
		case "join-submitted":
			return {
				kind: "join-submitted",
				requestId: event.requestId,
				targetPeerId: event.targetPeerId,
			};
		case "join-decision":
			return {
				kind: "join-decision",
				fromPeerId: event.fromPeerId,
				spaceId: event.spaceId || undefined,
			};
		case "join-failed":
			return {
				kind: "join-failed",
				targetPeerId: event.targetPeerId,
				error: event.error,
			};
		default:
			return null;
	}
}
