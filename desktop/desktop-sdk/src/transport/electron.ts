/**
 * Electron implementation of {@link Transport}.
 *
 * The current Soma desktop ships Electron with a preload bridge that
 * exposes `window.api.invoke(channel, args)` plus per-channel event
 * subscribers (`onDomainEvent`, `onAgentEvent`, ...). This transport
 * adapts that surface so the same `@soma/sdk` facade drives both the
 * Electron renderer and the new Tauri shell.
 *
 * The mapping is intentionally narrow: only the three event channels
 * that exist on the preload bridge are reachable. Subscribing to any
 * other channel logs a warning and returns a no-op unsubscribe.
 */

import { toBackendError } from "../errors";
import type { Transport } from "./index";

/** Shape of the renderer-facing preload bridge that the Electron shell exposes on `window.api`. */
export interface ElectronPreloadBridge {
	invoke: <T = unknown>(channel: string, args?: unknown) => Promise<T>;
	onDomainEvent?: (handler: (event: unknown) => void) => () => void;
	onAgentEvent?: (handler: (event: unknown) => void) => () => void;
	onDeepLink?: (handler: (url: string) => void) => () => void;
}

export interface ElectronTransportOptions {
	/**
	 * Override the preload bridge lookup. Defaults to `window.api` at
	 * call-time. Useful for tests that stub the bridge.
	 */
	bridge?: () => ElectronPreloadBridge | undefined;
}

const DEFAULT_BRIDGE = (): ElectronPreloadBridge | undefined =>
	typeof window !== "undefined" ? ((window as unknown as { api?: ElectronPreloadBridge }).api ?? undefined) : undefined;

const DOMAIN_EVENT = "domain_event";
const AGENT_EVENT = "agent_event";
const DEEP_LINK_EVENT = "app:deep-link";

export function electronTransport(opts: ElectronTransportOptions = {}): Transport {
	const lookup = opts.bridge ?? DEFAULT_BRIDGE;

	return {
		async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
			const bridge = lookup();
			if (!bridge?.invoke) throw toBackendError({ kind: "other", message: "Electron preload bridge unavailable" });
			try {
				return (await bridge.invoke<T>(command, unwrapArgsEnvelope(args))) as T;
			} catch (err) {
				throw toBackendError(err);
			}
		},

		subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
			const bridge = lookup();
			if (!bridge) {
				console.warn(`[electronTransport] subscribe '${channel}' skipped: bridge unavailable`);
				return () => undefined;
			}
			const sub = preloadSubscriber(bridge, channel);
			if (!sub) {
				console.warn(`[electronTransport] no preload subscriber for channel '${channel}'`);
				return () => undefined;
			}
			// Preserve `this` so bridge implementations backed by a class /
			// internal state behave correctly — `bridge.onDomainEvent` may
			// be a method, not a closure.
			return sub.call(bridge, handler as (event: unknown) => void);
		},
	};
}

/**
 * The SDK's `api/*` modules wrap struct-style command args in `{ args: … }`
 * because the Tauri presenter's `pub async fn cmd(args: Args)` signature
 * expects exactly that shape. The Electron handlers in `command-registry/*`
 * receive the payload directly (flat). This helper unwraps the envelope so
 * one SDK call shape works against both shells without per-handler edits.
 *
 * Only collapses when `args` is the *only* key in the payload — calls
 * that pass `{ spaceId, documentId, … }` (multi-field, no `args`) stay
 * untouched.
 */
function unwrapArgsEnvelope(payload: Record<string, unknown>): unknown {
	const keys = Object.keys(payload);
	if (keys.length === 1 && keys[0] === "args") return payload.args;
	return payload;
}

function preloadSubscriber(
	bridge: ElectronPreloadBridge,
	channel: string,
): ((handler: (payload: unknown) => void) => () => void) | null {
	switch (channel) {
		case DOMAIN_EVENT:
			return bridge.onDomainEvent ?? null;
		case AGENT_EVENT:
			return bridge.onAgentEvent ?? null;
		case DEEP_LINK_EVENT:
			return bridge.onDeepLink ?? null;
		default:
			return null;
	}
}
