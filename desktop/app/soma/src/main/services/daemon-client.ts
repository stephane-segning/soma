import { accessSync } from "fs";
import { app } from "electron";
import grpc, {
	credentials,
	loadPackageDefinition,
	Metadata,
} from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import log from "electron-log";
import { injectable } from "inversify";
import { join, resolve } from "path";
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
	StreamEvents(
		request: StreamEventsRequest,
		metadata?: Metadata,
	): grpc.ClientReadableStream<DaemonEvent>;
};

@injectable()
export class DaemonClient {
	private readonly logger = log.scope("daemon-client");
	private readonly socketPath: string;
	private readonly client: GrpcDaemonClient;

	constructor() {
		this.socketPath =
			process.env.SOMA_DAEMON_SOCKET ??
			resolve(process.cwd(), "../../../backend", "soma-daemon.sock");

		this.client = this.buildClient();
	}

	async status(): Promise<StatusResponse> {
		return this.callUnary((req, cb) => this.client.Status(req, cb), {});
	}

	async joinSpace(request: JoinSpaceRequest): Promise<JoinSpaceResponse> {
		return this.callUnary((req, cb) => this.client.JoinSpace(req, cb), request);
	}

	async revokeSpace(request: RevokeSpaceRequest): Promise<RevokeSpaceResponse> {
		return this.callUnary(
			(req, cb) => this.client.RevokeSpace(req, cb),
			request,
		);
	}

	async listSpaceMembers(
		request: ListSpaceMembersRequest,
	): Promise<ListSpaceMembersResponse> {
		return this.callUnary(
			(req, cb) => this.client.ListSpaceMembers(req, cb),
			request,
		);
	}

	async issueIssuerCapability(
		request: IssueIssuerCapabilityRequest,
	): Promise<IssueIssuerCapabilityResponse> {
		return this.callUnary(
			(req, cb) => this.client.IssueIssuerCapability(req, cb),
			request,
		);
	}

	async discoverSpaces(): Promise<DiscoverSpacesResponse> {
		return this.callUnary((req, cb) => this.client.DiscoverSpaces(req, cb), {});
	}

	async listJoinRequests(): Promise<ListJoinRequestsResponse> {
		return this.callUnary(
			(req, cb) => this.client.ListJoinRequests(req, cb),
			{},
		);
	}

	async decideJoin(request: DecideJoinRequest): Promise<DecideJoinResponse> {
		return this.callUnary(
			(req, cb) => this.client.DecideJoin(req, cb),
			request,
		);
	}

	streamEvents(): Observable<DaemonEvent> {
		const stream = this.client.StreamEvents({}, new Metadata());
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

	private buildClient(): GrpcDaemonClient {
		const protoPath = this.resolveProtoPath();
		const definition = loadPackageDefinition(
			loadSync(protoPath, {
				keepCase: true,
				enums: String,
				longs: String,
				defaults: true,
				oneofs: true,
			}),
		) as unknown as {
			daemon: { v1: { Daemon: new (...args: unknown[]) => GrpcDaemonClient } };
		};

		const target = `unix:${this.socketPath}`;
		this.logger.info(`Connecting to soma-daemon at ${target}`);
		return new definition.daemon.v1.Daemon(
			target,
			credentials.createInsecure(),
		);
	}

	private resolveProtoPath(): string {
		const appRoot = app.getAppPath();
		const envOverride = process.env.SOMA_DAEMON_PROTO;

		const candidates = [
			envOverride ? resolve(envOverride) : null,
			// Packaged app layout (proto bundled next to compiled sources).
			join(appRoot, "proto", "daemon", "v1", "daemon.proto"),
			// Dev: app root under desktop/app/soma/out/main → repo proto at ../../proto.
			resolve(appRoot, "..", "..", "proto", "daemon", "v1", "daemon.proto"),
			// Alternate dev path when running from src/main directly.
			resolve(
				appRoot,
				"..",
				"..",
				"..",
				"proto",
				"daemon",
				"v1",
				"daemon.proto",
			),
			// Repo absolute hint from workspace root.
			resolve(appRoot, "../../../proto/daemon/v1/daemon.proto"),
		].filter(Boolean) as string[];

		for (const candidate of candidates) {
			try {
				accessSync(candidate);
				return candidate;
			} catch {
				// try next
			}
		}

		throw new Error(
			`Unable to locate daemon proto; tried ${candidates
				.map((p) => `"${p}"`)
				.join(", ")}`,
		);
	}

	private callUnary<Req, Res>(
		invoker: (
			request: Req,
			callback: grpc.requestCallback<Res>,
		) => grpc.ClientUnaryCall,
		request: Req,
	): Promise<Res> {
		return new Promise<Res>((resolve, reject) => {
			invoker(request, (err, response) => {
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
