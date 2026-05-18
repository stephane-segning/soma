import type { DaemonClient, DaemonStreamEvent } from "../daemon-client";
import type { DomainEventsService } from "../domain-events";
import type { AppLogger } from "../logger";

/**
 * Wires the daemon's libp2p event firehose (delivered via the napi addon's
 * `subscribeEvents`) into the renderer-facing `DomainEventsService` bus.
 * Maps the daemon's transport-level events to the domain-level invalidation
 * the renderer reacts to:
 *
 * - `document-blob-added` → `document-changed` for the affected (space, doc),
 *   so the editor refetches blob metadata.
 * - `join-decision` → `spaces-changed`, since approval mutates this peer's
 *   membership set.
 * - `join-submitted` / `join-failed` are operational-only and don't trigger
 *   a domain refresh; they're surfaced through logger.
 */
export class DaemonEventStreamBridge {
	private unsubscribe: (() => void) | null = null;

	constructor(
		private readonly daemon: DaemonClient,
		private readonly domainEvents: DomainEventsService,
		private readonly logger: AppLogger,
	) {}

	start(): void {
		if (this.unsubscribe) return;
		this.unsubscribe = this.daemon.streamEvents({
			onEvent: (event) => this.handle(event),
			onError: (error) => {
				this.logger.log("warn", "daemon event stream error", {
					error: error.message,
				});
			},
		});
		this.logger.log("info", "daemon event stream bridge started");
	}

	stop(): void {
		const unsubscribe = this.unsubscribe;
		this.unsubscribe = null;
		unsubscribe?.();
	}

	private handle(event: DaemonStreamEvent): void {
		switch (event.kind) {
			case "document-blob-added":
				this.domainEvents.broadcast({
					kind: "document-changed",
					source: "daemon",
					atMs: Date.now(),
					spaceId: event.spaceId,
					documentId: event.docId,
				});
				return;
			case "join-decision":
				this.domainEvents.broadcast({
					kind: "spaces-changed",
					source: "daemon",
					atMs: Date.now(),
					reason: "join-decision",
				});
				return;
			case "join-submitted":
				this.logger.log("info", "daemon join request submitted", {
					requestId: event.requestId,
					targetPeerId: event.targetPeerId,
				});
				return;
			case "join-failed":
				this.logger.log("warn", "daemon join request failed", {
					targetPeerId: event.targetPeerId,
					error: event.error,
				});
				return;
		}
	}
}
