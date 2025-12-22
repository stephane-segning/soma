import { basename, join, resolve } from "node:path";
import type grpc from "@grpc/grpc-js";
import { credentials, loadPackageDefinition, Metadata } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { app } from "electron";
import log from "electron-log";
import { accessSync } from "fs-extra";
import { injectable } from "inversify";
import { Observable } from "rxjs";

type StatusRequest = Record<string, never>;
type StatusResponse = { peerId: string; listenAddrs: string[] };

type JoinSpaceRequest = {
	spaceId: string;
	displayName: string;
	deviceName: string;
	targetPeerId: string;
	targetMultiaddrs: string[];
};
type JoinSpaceResponse = { requestId: string };

type RevokeSpaceRequest = {
	spaceId: string;
	subjectPeerId: string;
	reason?: string;
};
type RevokeSpaceResponse = { accepted: boolean };

type ListSpaceMembersRequest = { spaceId: string };
type SpaceMember = { peerId: string; role: string; expiresAt: number };
type ListSpaceMembersResponse = { members: SpaceMember[] };

type IssueIssuerCapabilityRequest = {
	spaceId: string;
	targetPeerId: string;
	expiresAt: number;
};
type IssueIssuerCapabilityResponse = { accepted: boolean };

type DiscoverSpacesRequest = Record<string, never>;
type DiscoveredSpace = { spaceId: string; displayName: string; tags: string[] };
type DiscoverSpacesResponse = { spaces: DiscoveredSpace[] };

type ListJoinRequestsRequest = Record<string, never>;
type JoinRequest = {
	requestId: string;
	spaceId: string;
	subjectPeerId: string;
	displayName: string;
	deviceName: string;
	requestedRole: number;
	createdAt: number;
};
type ListJoinRequestsResponse = { requests: JoinRequest[] };

type DecideJoinRequest = {
	requestId: string;
	approve: boolean;
	role?: string;
	reason?: string;
};
type DecideJoinResponse = { decision?: unknown };

type StreamEventsRequest = Record<string, never>;
type JoinDecisionEvent = { fromPeerId: string; decision?: unknown };
type JoinSubmitEvent = { requestId: string; targetPeerId: string };
type JoinFailedEvent = { targetPeerId: string; error: string };
type DaemonEvent = {
	joinDecision?: JoinDecisionEvent;
	joinSubmitted?: JoinSubmitEvent;
	joinFailed?: JoinFailedEvent;
};

type UpsertDocumentRequest = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: boolean;
	updatedAtMs: number;
};

type UpsertDocumentWireRequest = {
	space_id: string;
	document_id: string;
	content_json: string;
	published: boolean;
	updated_at_ms: number;
};

type UploadBlobRequest = {
	spaceId: string;
	data: Uint8Array;
	mime: string;
	name: string;
	docId?: string;
};

type UploadBlobWireRequest = {
	space_id: string;
	data: Buffer;
	mime: string;
	name: string;
	doc_id: string;
};

type UploadBlobResponse = {
	cid: string;
	size: string | number;
	mime: string;
	name: string;
};

type GrpcDaemonClient = grpc.Client & {
	Status(
		request: StatusRequest,
		callback: grpc.requestCallback<StatusResponse>,
	): grpc.ClientUnaryCall;
	JoinSpace(
		request: JoinSpaceRequest,
		callback: grpc.requestCallback<JoinSpaceResponse>,
	): grpc.ClientUnaryCall;
	RevokeSpace(
		request: RevokeSpaceRequest,
		callback: grpc.requestCallback<RevokeSpaceResponse>,
	): grpc.ClientUnaryCall;
	ListSpaceMembers(
		request: ListSpaceMembersRequest,
		callback: grpc.requestCallback<ListSpaceMembersResponse>,
	): grpc.ClientUnaryCall;
	IssueIssuerCapability(
		request: IssueIssuerCapabilityRequest,
		callback: grpc.requestCallback<IssueIssuerCapabilityResponse>,
	): grpc.ClientUnaryCall;
	DiscoverSpaces(
		request: DiscoverSpacesRequest,
		callback: grpc.requestCallback<DiscoverSpacesResponse>,
	): grpc.ClientUnaryCall;
	ListJoinRequests(
		request: ListJoinRequestsRequest,
		callback: grpc.requestCallback<ListJoinRequestsResponse>,
	): grpc.ClientUnaryCall;
	DecideJoin(
		request: DecideJoinRequest,
		callback: grpc.requestCallback<DecideJoinResponse>,
	): grpc.ClientUnaryCall;
	UpsertDocument(
		request: UpsertDocumentWireRequest,
		callback: grpc.requestCallback<{ ok: boolean }>,
	): grpc.ClientUnaryCall;
	UploadBlob(
		request: UploadBlobWireRequest,
		callback: grpc.requestCallback<UploadBlobResponse>,
	): grpc.ClientUnaryCall;
	StreamEvents(
		request: StreamEventsRequest,
		metadata?: Metadata,
	): grpc.ClientReadableStream<DaemonEvent>;
};

@injectable()
export class DaemonClient {
	private readonly logger = log.scope("daemon-client");
	private socketPath: string;
	private client: GrpcDaemonClient | null = null;

	constructor() {
		this.socketPath = this.resolveDefaultSocketPath();
	}

	setSocketPath(socketPath: string): void {
		if (socketPath && socketPath !== this.socketPath) {
			this.socketPath = socketPath;
			this.client = null;
		}
	}

	async status(): Promise<StatusResponse> {
		return this.callUnary((client, req, cb) => client.Status(req, cb), {});
	}

	async joinSpace(request: JoinSpaceRequest): Promise<JoinSpaceResponse> {
		return this.callUnary(
			(client, req, cb) => client.JoinSpace(req, cb),
			request,
		);
	}

	async revokeSpace(request: RevokeSpaceRequest): Promise<RevokeSpaceResponse> {
		return this.callUnary(
			(client, req, cb) => client.RevokeSpace(req, cb),
			request,
		);
	}

	async listSpaceMembers(
		request: ListSpaceMembersRequest,
	): Promise<ListSpaceMembersResponse> {
		return this.callUnary(
			(client, req, cb) => client.ListSpaceMembers(req, cb),
			request,
		);
	}

	async issueIssuerCapability(
		request: IssueIssuerCapabilityRequest,
	): Promise<IssueIssuerCapabilityResponse> {
		return this.callUnary(
			(client, req, cb) => client.IssueIssuerCapability(req, cb),
			request,
		);
	}

	async discoverSpaces(): Promise<DiscoverSpacesResponse> {
		return this.callUnary(
			(client, req, cb) => client.DiscoverSpaces(req, cb),
			{},
		);
	}

	async listJoinRequests(): Promise<ListJoinRequestsResponse> {
		return this.callUnary(
			(client, req, cb) => client.ListJoinRequests(req, cb),
			{},
		);
	}

	async decideJoin(request: DecideJoinRequest): Promise<DecideJoinResponse> {
		return this.callUnary(
			(client, req, cb) => client.DecideJoin(req, cb),
			request,
		);
	}

	async upsertDocument(request: UpsertDocumentRequest): Promise<void> {
		const wire: UpsertDocumentWireRequest = {
			space_id: request.spaceId,
			document_id: request.documentId,
			content_json: request.contentJson,
			published: request.published,
			updated_at_ms: request.updatedAtMs,
		};
		await this.callUnary(
			(client, req, cb) => client.UpsertDocument(req, cb),
			wire,
		);
	}

	async uploadBlob(request: UploadBlobRequest): Promise<UploadBlobResponse> {
		const wire: UploadBlobWireRequest = {
			space_id: request.spaceId,
			data: Buffer.from(request.data),
			mime: request.mime,
			name: request.name,
			doc_id: request.docId ?? "",
		};
		return this.callUnary(
			(client, req, cb) => client.UploadBlob(req, cb),
			wire,
		);
	}

	streamEvents(): Observable<DaemonEvent> {
		const stream = this.getClient().StreamEvents({}, new Metadata());
		return new Observable<DaemonEvent>((subscriber) => {
			stream.on("data", (event) => subscriber.next(event));
			stream.on("error", (err) => {
				subscriber.error(err);
			});
			stream.on("end", () => subscriber.complete());

			return () => {
				stream.cancel();
			};
		});
	}

	private getClient(): GrpcDaemonClient {
		if (this.client) return this.client;
		const protoPath = this.resolveProtoPath();
		const includeDirs = this.resolveProtoIncludeDirs(protoPath);
		this.logger.info(`Using daemon proto at ${protoPath}`);
		const definition = loadPackageDefinition(
			loadSync(protoPath, {
				keepCase: true,
				enums: String,
				longs: String,
				defaults: true,
				oneofs: true,
				includeDirs,
			}),
		) as unknown as {
			daemon: { v1: { Daemon: new (...args: unknown[]) => GrpcDaemonClient } };
		};

		const target = `unix:${this.socketPath}`;
		this.logger.info(`Connecting to soma-daemon at ${target}`);
		this.client = new definition.daemon.v1.Daemon(
			target,
			credentials.createInsecure(),
		);
		return this.client;
	}

	private resolveDefaultSocketPath(): string {
		const fromEnv = process.env.SOMA_DAEMON_SOCKET;
		if (fromEnv && fromEnv.trim()) return fromEnv.trim();

		if (app.isReady()) {
			return resolve(app.getPath("userData"), "soma-daemon.sock");
		}

		// Dev fallback (works when running from `desktop/`).
		return resolve(process.cwd(), "../../../backend", "soma-daemon.sock");
	}

	private resolveProtoPath(): string {
		const appRoot = app.isReady() ? app.getAppPath() : process.cwd();
		const envOverride = process.env.SOMA_DAEMON_PROTO;

		const candidates = [
			envOverride ? resolve(envOverride) : null,
			// Packaged app layout (proto bundled next to compiled sources).
			join(appRoot, "proto", "daemon", "v1", "daemon.proto"),
			join(appRoot, "../../proto/daemon/v1/daemon.proto"),
		].filter(Boolean) as string[];

		for (const candidate of candidates) {
			try {
				accessSync(candidate);
				return candidate;
			} catch {
				// try next
			}
		}

		this.logger.error("Failed to locate daemon proto");

		throw new Error(
			`Unable to locate daemon proto; tried ${candidates
				.map((p) => `"${p}"`)
				.join(", ")}`,
		);
	}

	private resolveProtoIncludeDirs(protoPath: string): string[] {
		const env = process.env.SOMA_DAEMON_PROTO_INCLUDE_DIRS;
		if (env?.trim()) {
			return env
				.split(",")
				.map((p) => p.trim())
				.filter(Boolean)
				.map((p) => resolve(p));
		}

		// Try to find a directory named `proto` above protoPath.
		let cur = resolve(protoPath, "..");
		for (let i = 0; i < 6; i++) {
			if (basename(cur) === "proto") break;
			const candidate = resolve(cur, "..");
			if (candidate === cur) break;
			cur = candidate;
		}

		const protoRoot =
			basename(cur) === "proto" ? cur : resolve(protoPath, "../../../..");
		return [protoRoot];
	}

	private callUnary<Req, Res>(
		invoker: (
			client: GrpcDaemonClient,
			request: Req,
			callback: grpc.requestCallback<Res>,
		) => grpc.ClientUnaryCall,
		request: Req,
	): Promise<Res> {
		return new Promise<Res>((resolve, reject) => {
			const client = this.getClient();
			invoker(client, request, (err, response) => {
				if (err) {
					this.logger.error("Daemon call failed", err);
					reject(err);
					return;
				}
				if (!response) {
					reject(new Error("Empty response from soma-daemon"));
					return;
				}
				resolve(response);
			});
		});
	}
}
