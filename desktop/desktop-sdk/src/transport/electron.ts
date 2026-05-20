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
				return (await bridge.invoke<T>(command, args)) as T;
			} catch (err) {
				throw toBackendError(err);
			}
		},

		subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
			const bridge = lookup();
			if (!bridge) return () => undefined;
			const sub = preloadSubscriber(bridge, channel);
			if (!sub) {
				console.warn(`[electronTransport] no preload subscriber for channel '${channel}'`);
				return () => undefined;
			}
			return sub(handler as (event: unknown) => void);
		},
	};
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
