/**
 * Wire types — mirror the Rust DTOs in `desktop_commands::*` and
 * `desktop_agent::types`. camelCase on the wire matches the serde
 * `rename_all = "camelCase"` annotations on the Rust side.
 *
 * Keep this file the single source of truth on the TS side — domain
 * modules import from here, not from their own ad-hoc declarations.
 */

// --- Daemon -----------------------------------------------------------------

export type DaemonStatus = {
	peerId: string;
	listenAddrs: string[];
};

// --- Spaces / membership / joins -------------------------------------------

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

export type ListSpacesArgs = {
	q?: string;
	limit?: number;
	offset?: number;
};

export type ListSpacesResult = {
	spaces: StoredSpace[];
	limit: number;
	offset: number;
	nextOffset?: number | null;
};

export type CreateSpaceArgs = {
	/** Optional — daemon generates a CUID when omitted/empty. */
	spaceId?: string;
	/** Optional — daemon defaults are used when omitted/empty. */
	displayName?: string;
};

export type JoinSpaceArgs = {
	spaceId: string;
	targetPeerId: string;
	targetMultiaddrs: string[];
	displayName?: string;
	deviceName?: string;
};

export type JoinSpaceResult = { requestId: string };

export type DecideJoinArgs = {
	requestId: string;
	approve: boolean;
	role?: string;
	reason?: string;
};

export type DecideJoinResult = {
	decisionId: string;
	spaceId: string;
	subjectPeerId: string;
	decision: number;
	reason: string;
	approved: boolean;
};

export type StoredSpaceBot = {
	spaceId: string;
	peerId: string;
	expiresAt: number;
	alias: string | null;
	status: string;
	scopes: string[];
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

export type RevokeMemberArgs = {
	spaceId: string;
	subjectPeerId: string;
	reason?: string;
};

export type IssueIssuerCapabilityArgs = {
	spaceId: string;
	targetPeerId: string;
	expiresAt: number;
	alias?: string | null;
	scopes?: string[];
};

// --- Documents + pages ------------------------------------------------------

export type StoredDocument = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
	updatedAtMs: number;
};

export type UpsertDocumentArgs = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published?: boolean;
	/** Optional — defaults to wall-clock when omitted. */
	updatedAtMs?: number;
};

export type StoredPage = {
	spaceId: string;
	pageId: string;
	title: string;
	parentPageIds: string[];
	createdAtMs: number;
	updatedAtMs: number;
};

export type EnsurePageArgs = {
	spaceId: string;
	pageId: string;
	title?: string;
	parentPageIds?: string[];
	/** Optional — defaults to wall-clock when omitted. */
	createdAtMs?: number;
	/** Optional — defaults to wall-clock when omitted. */
	updatedAtMs?: number;
};

export type UpdatePageTitleArgs = {
	spaceId: string;
	pageId: string;
	title: string;
};

export type SetPageParentsArgs = {
	spaceId: string;
	pageId: string;
	parentPageIds: string[];
};

// --- Blobs ------------------------------------------------------------------

export type UploadBlobArgs = {
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

export type StageUploadArgs = {
	bytes: number[];
	mime: string;
	fileName?: string;
};

export type StagedUpload = {
	payloadPath: string;
	byteLength: number;
	mime: string;
	fileName?: string;
	createdAtMs: number;
};

// --- Agent ------------------------------------------------------------------

export type AgentProvider = "openai-compatible";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatOptions = {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	spaceId?: string;
};

export type ChatResponse = {
	token: string;
	done: boolean;
	error: string;
};

export type ModelKind = "chat" | "embed" | "unknown";

export type AgentModel = {
	name: string;
	kind: ModelKind;
	path: string;
	loaded: boolean;
	sizeBytes?: number;
};

export type RerankCandidate = { id: string; content: string };

export type RerankParams = {
	query: string;
	candidates: RerankCandidate[];
	model?: string;
	topN?: number;
	spaceId?: string;
};

export type RerankResult = {
	id: string;
	score: number;
	rank: number;
};

export type ResolveDriftParams = {
	leftUpdateBase64: string;
	rightUpdateBase64: string;
};

export type ResolveDriftResult = { mergedUpdateBase64: string };

export type BackgroundTaskKind = "explain-selection" | "expand-selection" | "research-selection";

export type BackgroundTaskStatus = "queued" | "running" | "succeeded" | "failed" | "unknown";

export type BackgroundTask = {
	taskId: string;
	kind: BackgroundTaskKind;
	status: BackgroundTaskStatus;
	spaceId: string;
	documentId: string;
	selectionText: string;
	persistInDocument: boolean;
	resultText: string;
	error: string;
	createdAtMs: number;
	updatedAtMs: number;
};

export type EnqueueBackgroundTaskParams = {
	kind: BackgroundTaskKind;
	spaceId: string;
	documentId: string;
	selectionText: string;
	model?: string;
	persistInDocument?: boolean;
};

export type ListBackgroundTasksParams = {
	spaceId?: string;
	limit?: number;
};

// --- Events -----------------------------------------------------------------

export type DomainEvent =
	| {
			kind: "document-blob-added";
			spaceId: string;
			docId: string;
			cid: string;
			mime: string;
			size: number;
			name: string;
	  }
	| { kind: "join-submitted"; requestId: string; targetPeerId: string }
	| { kind: "join-decision"; fromPeerId: string; spaceId: string; decision: number; reason: string }
	| { kind: "join-failed"; targetPeerId: string; error: string }
	| { kind: "bot-status-changed"; spaceId: string; delegatePeerId: string; status: string };

export type AgentRuntimeEvent =
	| { kind: "ready"; atMs: number; provider: AgentProvider; baseUrl: string }
	| { kind: "status"; atMs: number; provider: AgentProvider; baseUrl: string; models: AgentModel[] }
	| { kind: "error"; atMs: number; provider: AgentProvider; baseUrl: string; error: string };

export type DeepLinkUrl = string;
