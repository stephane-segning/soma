import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	DaemonClient,
	DaemonStreamEvent,
	DaemonStreamHandlers,
} from "../daemon-client";
import type { DomainEventsService } from "../domain-events";
import type { AppLogger } from "../logger";
import { DaemonEventStreamBridge } from "./daemon-events";

function makeBridge() {
	const broadcast = vi.fn();
	const log = vi.fn();
	const unsubscribe = vi.fn();
	let capturedHandlers: DaemonStreamHandlers | null = null;

	const daemon = {
		streamEvents: vi.fn((handlers: DaemonStreamHandlers) => {
			capturedHandlers = handlers;
			return unsubscribe;
		}),
	} as unknown as DaemonClient;
	const domainEvents = { broadcast } as unknown as DomainEventsService;
	const logger = { log } as unknown as AppLogger;

	const bridge = new DaemonEventStreamBridge(daemon, domainEvents, logger);
	bridge.start();

	const fire = (event: DaemonStreamEvent) => {
		capturedHandlers?.onEvent(event);
	};
	return { bridge, broadcast, log, unsubscribe, fire };
}

describe("DaemonEventStreamBridge.bot-status-changed", () => {
	let env: ReturnType<typeof makeBridge>;

	beforeEach(() => {
		env = makeBridge();
	});

	it("translates the daemon event into a space-changed domain event for the affected space", () => {
		env.fire({
			kind: "bot-status-changed",
			spaceId: "space_1",
			delegatePeerId: "12D3KooWBot",
			status: "active",
		});

		expect(env.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "space-changed",
				source: "daemon",
				spaceId: "space_1",
				reason: "bot-status-changed",
			}),
		);
	});

	it("forwards the status string verbatim through the logger entry (debug surface for future states)", () => {
		env.fire({
			kind: "bot-status-changed",
			spaceId: "space_1",
			delegatePeerId: "12D3KooWBot",
			status: "expired",
		});

		expect(env.log).toHaveBeenCalledWith(
			"debug",
			expect.stringMatching(/bot status/i),
			expect.objectContaining({
				spaceId: "space_1",
				delegatePeerId: "12D3KooWBot",
				status: "expired",
			}),
		);
	});

	it("broadcasts once per event even when status repeats (transitions, not deduped at the bridge)", () => {
		env.fire({
			kind: "bot-status-changed",
			spaceId: "space_1",
			delegatePeerId: "12D3KooWBot",
			status: "pending",
		});
		env.fire({
			kind: "bot-status-changed",
			spaceId: "space_1",
			delegatePeerId: "12D3KooWBot",
			status: "active",
		});

		expect(env.broadcast).toHaveBeenCalledTimes(2);
	});
});
