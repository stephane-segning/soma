/**
 * Typed event listeners. Matches the channel names from
 * `desktop_core::events` so the renderer talks to the same constants the
 * Rust broadcasters use.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AgentRuntimeEvent, DeepLinkUrl, DomainEvent } from "./types";

const DOMAIN_EVENT = "domain_event";
const AGENT_EVENT = "agent_event";
const DEEP_LINK_EVENT = "app:deep-link";

type Handler<T> = (event: T) => void;

/**
 * Subscribe to one of the renderer-facing channels. Returns a synchronous
 * unsubscribe — internally the listener resolves on a tick, but we
 * surface the function eagerly so call sites don't need to `await` the
 * subscription.
 */
function subscribe<T>(channel: string, handler: Handler<T>): () => void {
	const pending: Promise<UnlistenFn> = listen<T>(channel, ({ payload }) => handler(payload));
	let unlisten: UnlistenFn | null = null;
	let cancelled = false;
	void pending.then((fn) => {
		if (cancelled) {
			fn();
			return;
		}
		unlisten = fn;
	});
	return () => {
		cancelled = true;
		unlisten?.();
	};
}

export const events = {
	onDomain: (handler: Handler<DomainEvent>) => subscribe<DomainEvent>(DOMAIN_EVENT, handler),
	onAgent: (handler: Handler<AgentRuntimeEvent>) => subscribe<AgentRuntimeEvent>(AGENT_EVENT, handler),
	onDeepLink: (handler: Handler<DeepLinkUrl>) => subscribe<DeepLinkUrl>(DEEP_LINK_EVENT, handler),
};
