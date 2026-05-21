/**
 * HTTP / SSE implementation of {@link Transport}. Targets the BFF binary
 * (`desktop-bff`) so the same SDK can run in a plain browser.
 *
 * Wire shape (mirrors `desktop-bff`):
 * - Commands → `POST {baseUrl}/api/v1/<command_name>` with JSON body.
 *   Responses are JSON; non-2xx maps to {@link BackendError}.
 * - Events  → `GET  {baseUrl}/api/v1/events` as an SSE stream. Each
 *   delivered frame uses the SSE event name `domain_event`; the
 *   `data` field is a JSON-encoded `DomainEvent` (the same shape the
 *   Tauri shell forwards via `app.emit(DOMAIN_EVENT, ...)`).
 *
 * Channel mapping:
 * - `subscribe('domain_event', h)` opens (or reuses) a single
 *   `EventSource` against `/api/v1/events`. Multiple subscribers share
 *   the connection; the last unsubscribe closes it.
 * - Subscribing to channels the BFF doesn't expose (`agent_event`,
 *   `app:deep-link`) logs a warning and returns a no-op unsubscribe,
 *   matching the electron transport's "best-effort" stance.
 */

import { BackendError, toBackendError } from "../errors";
import type { Transport } from "./index";

export interface HttpTransportOptions {
	/** e.g. `https://soma.example.com` or `/` (same-origin). */
	baseUrl: string;
	/** Returns the value of the `Authorization` header, or `null` for unauthenticated. */
	authHeader?: () => Promise<string | null> | string | null;
	/** API version prefix; defaults to `/api/v1`. */
	apiPrefix?: string;
	/** Hook invoked when a request returns 401, before the original error is thrown. */
	onUnauthenticated?: () => void;
	/** Override `fetch`; useful for tests. */
	fetch?: typeof globalThis.fetch;
	/**
	 * Override `EventSource`; useful for tests and for runtimes where
	 * the global isn't present (e.g. Node before v22 without
	 * `--experimental-eventsource`). When omitted the transport reads
	 * `globalThis.EventSource` at subscribe-time and throws a typed
	 * `BackendError` if it isn't available.
	 */
	eventSource?: EventSourceCtor;
}

/**
 * Minimal `EventSource` constructor surface we depend on. Matches the
 * web spec; intentionally narrow so polyfills (`eventsource` on npm,
 * `undici.EventSource`, jsdom's built-in) plug in cleanly.
 */
export type EventSourceCtor = new (url: string, init?: EventSourceInit) => EventSourceLike;

/** Minimal `EventSource` instance surface — only what the transport touches. */
export interface EventSourceLike {
	readonly readyState: number;
	onopen: ((this: EventSourceLike, ev: Event) => unknown) | null;
	onerror: ((this: EventSourceLike, ev: Event) => unknown) | null;
	addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
	removeEventListener(type: string, listener: (ev: MessageEvent) => void): void;
	close(): void;
}

/**
 * The single SSE event name the BFF emits. Anything else delivered on
 * the stream is ignored by this transport (forwards-compatible: future
 * server-side event names won't deserialize as `DomainEvent`).
 */
const SSE_EVENT_NAME = "domain_event";

/**
 * Channels the SDK exposes that this transport knows how to serve from
 * the BFF's SSE stream. Today: only the domain-event firehose.
 */
const SSE_CHANNELS = new Set<string>([SSE_EVENT_NAME]);

export function httpTransport(opts: HttpTransportOptions): Transport {
	const prefix = opts.apiPrefix ?? "/api/v1";
	const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
	const base = opts.baseUrl.replace(/\/+$/, "");

	async function authHeaders(): Promise<Record<string, string>> {
		const value = opts.authHeader ? await opts.authHeader() : null;
		return value ? { Authorization: value } : {};
	}

	// One pool per transport instance. `subscribe('domain_event', ...)`
	// reuses a single underlying `EventSource` across all renderer
	// handlers; the last `unsubscribe()` tears the connection down.
	const sse = new SseConnectionPool(`${base}${prefix}/events`, () => resolveEventSource(opts.eventSource));

	return {
		async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
			let response: Response;
			try {
				response = await fetchImpl(`${base}${prefix}/${command}`, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...(await authHeaders()) },
					body: JSON.stringify(args),
					credentials: "include",
				});
			} catch (err) {
				throw toBackendError(err);
			}
			if (response.status === 401) {
				opts.onUnauthenticated?.();
				throw new BackendError("unauthenticated", "session expired");
			}
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				throw toBackendError(payload ?? { kind: "other", message: response.statusText });
			}
			return (await response.json()) as T;
		},

		subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
			if (!SSE_CHANNELS.has(channel)) {
				// Mirror electronTransport's posture: don't throw — the SDK's
				// `events()` helper subscribes to several channels at boot
				// and only some are reachable from each transport.
				console.warn(
					`[httpTransport] subscribe '${channel}' is a no-op — the BFF only exposes '${SSE_EVENT_NAME}' over SSE.`,
				);
				return () => undefined;
			}
			return sse.add(handler as (payload: unknown) => void);
		},
	};
}

function resolveEventSource(override: EventSourceCtor | undefined): EventSourceCtor {
	if (override) return override;
	const g = globalThis as unknown as { EventSource?: EventSourceCtor };
	if (!g.EventSource) {
		throw new BackendError(
			"other",
			"httpTransport.subscribe requires a global `EventSource` — pass `eventSource:` in HttpTransportOptions when running outside a browser.",
		);
	}
	return g.EventSource;
}

/**
 * Connection pool for the BFF's single SSE endpoint. Holds at most one
 * `EventSource` open and ref-counts handlers so:
 *
 * - Multiple `subscribe('domain_event', ...)` calls share one TCP/HTTP
 *   connection (matches the "one EventSource per origin" SSE idiom).
 * - Unsubscribing the last handler closes the underlying connection.
 *
 * Reconnect: the spec mandates that `EventSource` auto-reconnects on
 * transport errors with its own backoff (`retry:` field, default ~3s).
 * We rely on that; we only log error events for visibility. Closing on
 * error and reopening manually would *double* reconnect attempts.
 */
class SseConnectionPool {
	private es: EventSourceLike | null = null;
	private handlers = new Set<(payload: unknown) => void>();
	private listener: ((ev: MessageEvent) => void) | null = null;

	constructor(
		private readonly url: string,
		private readonly resolveCtor: () => EventSourceCtor,
	) {}

	add(handler: (payload: unknown) => void): () => void {
		this.handlers.add(handler);
		this.ensureOpen();
		let removed = false;
		return () => {
			if (removed) return;
			removed = true;
			this.handlers.delete(handler);
			if (this.handlers.size === 0) this.teardown();
		};
	}

	private ensureOpen(): void {
		if (this.es) return;
		const Ctor = this.resolveCtor();
		const es = new Ctor(this.url, { withCredentials: true });
		const listener = (ev: MessageEvent) => this.dispatch(ev);
		es.addEventListener(SSE_EVENT_NAME, listener);
		es.onerror = (ev) => {
			// `EventSource` auto-reconnects on its own; we just trace so
			// consumers can see flaps. The browser flips `readyState`
			// between OPEN (1) and CONNECTING (0) across a reconnect.
			console.warn("[httpTransport] SSE error event (auto-reconnect will continue):", ev);
		};
		this.es = es;
		this.listener = listener;
	}

	private dispatch(ev: MessageEvent): void {
		// `data` is always a string on a real EventSource; guard anyway
		// so a malformed polyfill can't throw the whole pump.
		const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch (err) {
			console.warn("[httpTransport] dropping unparseable SSE frame:", err, raw);
			return;
		}
		// Snapshot subscribers so an `unsubscribe()` mid-dispatch
		// doesn't trip the iteration.
		for (const h of [...this.handlers]) {
			try {
				h(payload);
			} catch (err) {
				console.error("[httpTransport] subscriber threw:", err);
			}
		}
	}

	private teardown(): void {
		if (!this.es) return;
		if (this.listener) this.es.removeEventListener(SSE_EVENT_NAME, this.listener);
		this.es.onerror = null;
		this.es.close();
		this.es = null;
		this.listener = null;
	}
}
