/**
 * Typed event subscribers. The channel names match
 * `desktop_core::events::*` so the renderer talks to the same constants
 * the Rust broadcasters use.
 */

import type { AgentRuntimeEvent, DeepLinkRoute, DomainEvent } from "./bindings";
import type { Transport } from "./transport";

const DOMAIN_EVENT = "domain_event";
const AGENT_EVENT = "agent_event";
const DEEP_LINK_EVENT = "app:deep-link";

export function events(t: Transport) {
	return {
		onDomain: (h: (e: DomainEvent) => void) => t.subscribe<DomainEvent>(DOMAIN_EVENT, h),
		onAgent: (h: (e: AgentRuntimeEvent) => void) => t.subscribe<AgentRuntimeEvent>(AGENT_EVENT, h),
		/**
		 * A parsed `soma://` deep link — `route.kind` is `"invite"` (with
		 * `route.link`, the full link ready for `backend.invites.inspect`)
		 * or `"unknown"` (with the raw `route.url`, for anything that
		 * didn't match a known route).
		 */
		onDeepLink: (h: (route: DeepLinkRoute) => void) => t.subscribe<DeepLinkRoute>(DEEP_LINK_EVENT, h),
	};
}
