import type { DaemonClient } from "../daemon-client";
import type { DomainEventsService } from "../domain-events";
import type { AppLogger } from "../logger";

/**
 * TODO(phase-5): rewire to addon `streamEvents` once `@soma/node` exposes the
 * daemon peer-event subscription. Until then there is no live event stream
 * coming from the embedded runtime — controllers fall back to request/response
 * updates and renderer-side refresh. Kept as a class to preserve the existing
 * lifecycle hooks in `startup-service.ts`.
 */
export class DaemonEventStreamBridge {
	constructor(
		private readonly daemon: DaemonClient,
		_domainEvents: DomainEventsService,
		private readonly logger: AppLogger,
	) {}

	start(): void {
		this.logger.log(
			"warn",
			"daemon event stream bridge started without a transport; live events will not be forwarded (phase-5)",
		);
		// Calling through preserves the legacy public surface — `streamEvents`
		// itself is a no-op stub today.
		const unsubscribe = this.daemon.streamEvents({ onEvent: () => {} });
		unsubscribe();
	}

	stop(): void {
		// Nothing to clean up while the stream is stubbed out.
	}
}
