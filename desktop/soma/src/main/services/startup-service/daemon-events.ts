import type { DaemonClient, DaemonStreamEvent } from "../daemon-client";
import type { DomainEventsService } from "../domain-events";
import type { AppLogger } from "../logger";

export class DaemonEventStreamBridge {
	private unsubscribe: (() => void) | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private stopped = false;

	constructor(
		private readonly daemon: DaemonClient,
		private readonly domainEvents: DomainEventsService,
		private readonly logger: AppLogger,
	) {}

	start(): void {
		this.stopped = false;
		this.connect();
	}

	stop(): void {
		this.stopped = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
	}

	private connect(): void {
		if (this.stopped) return;
		this.clearActiveStream();
		this.unsubscribe = this.daemon.streamEvents({
			onEvent: (event) => this.handleEvent(event),
			onError: (error) => {
				if (this.stopped) return;
				this.logger.log("warn", "daemon event stream error", {
					error: error.message,
				});
				this.scheduleReconnect();
			},
			onEnd: () => {
				if (this.stopped) return;
				this.logger.log("warn", "daemon event stream ended; reconnecting");
				this.scheduleReconnect();
			},
		});
	}

	private clearActiveStream(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, 1_000);
	}

	private handleEvent(event: DaemonStreamEvent): void {
		switch (event.kind) {
			case "document-blob-added":
				this.domainEvents.broadcast({
					kind: "document-changed",
					source: "daemon",
					atMs: Date.now(),
					spaceId: event.spaceId,
					documentId: event.docId,
					reason: "daemon_document_blob_added",
				});
				return;
			case "join-decision":
				this.broadcastJoinDecision(event.spaceId);
				return;
			case "join-submitted":
			case "join-failed":
				return;
		}
	}

	private broadcastJoinDecision(spaceId?: string): void {
		if (spaceId) {
			this.domainEvents.broadcast({
				kind: "space-changed",
				source: "daemon",
				atMs: Date.now(),
				spaceId,
				reason: "daemon_join_decision",
			});
			return;
		}
		this.domainEvents.broadcast({
			kind: "spaces-changed",
			source: "daemon",
			atMs: Date.now(),
			reason: "daemon_join_decision",
		});
	}
}
