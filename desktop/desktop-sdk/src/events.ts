/**
 * Typed event subscribers. The channel names match
 * `desktop_core::events::*` so the renderer talks to the same constants
 * the Rust broadcasters use.
 */

import type { AgentRuntimeEvent, DomainEvent } from "./bindings";
import type { Transport } from "./transport";

const DOMAIN_EVENT = "domain_event";
const AGENT_EVENT = "agent_event";
const DEEP_LINK_EVENT = "app:deep-link";

export function events(t: Transport) {
	return {
		onDomain: (h: (e: DomainEvent) => void) => t.subscribe<DomainEvent>(DOMAIN_EVENT, h),
		onAgent: (h: (e: AgentRuntimeEvent) => void) => t.subscribe<AgentRuntimeEvent>(AGENT_EVENT, h),
		onDeepLink: (h: (url: string) => void) => t.subscribe<string>(DEEP_LINK_EVENT, h),
	};
}
