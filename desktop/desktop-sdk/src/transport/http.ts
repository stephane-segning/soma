/**
 * HTTP / WebSocket implementation of {@link Transport}. Targets the BFF
 * binary (`desktop-bff`) so the same SDK can run in a plain browser.
 *
 * Wire shape (mirrors `desktop-bff`):
 * - Commands → `POST {baseUrl}{apiPrefix}/<command_name>` with a JSON body
 *   (the args object directly, no `{args: ...}` envelope). A JSON response
 *   (`Content-Type: application/json`) is parsed and returned as-is;
 *   non-2xx maps to {@link BackendError}. A *non*-JSON response — today
 *   only `blobs_read`'s `application/octet-stream` bytes — is read as an
 *   `ArrayBuffer` and handed back as a plain `number[]`, matching the
 *   shape Tauri's `invoke` already produces for a `Vec<u8>` return value
 *   (see `invoke`'s own doc comment below for the full contract).
 * - Events  → `GET {baseUrl}{apiPrefix}/ws` as a single WebSocket
 *   connection. Every event this process knows about is multiplexed onto
 *   it as one JSON text frame per event:
 *   `{"v":1,"channel":"domain"|"agent","event":{...}}`. See
 *   `desktop-bff/src/ws.rs`'s module doc for the authoritative contract;
 *   `desktop-bff/tests/ws.rs` is the server-side conformance suite this
 *   client is written against.
 *
 * Channel mapping:
 * - `subscribe('domain_event', h)` / `subscribe('agent_event', h)` open
 *   (or reuse) a single shared `WebSocket` against `{apiPrefix}/ws`, and
 *   route each incoming frame to the subscribers registered for its
 *   `channel` tag (`"domain"` → `domain_event`, `"agent"` → `agent_event`).
 *   Multiple subscribers — on either channel — share the one connection;
 *   the last unsubscribe (across both channels) closes it.
 * - Subscribing to a channel the BFF doesn't expose over this stream
 *   (e.g. `app:deep-link`, which is an OS-level concept with no server
 *   side) logs a warning and returns a no-op unsubscribe, matching the
 *   Tauri transport's "best-effort" stance for channels it can't serve.
 *
 * Auth: every route (REST and the WebSocket upgrade) requires a bearer
 * token. REST sends it as `Authorization: Bearer <token>` via
 * {@link HttpTransportOptions.authHeader}. A browser's native
 * `WebSocket` constructor cannot set request headers, so the WebSocket
 * connection instead offers it as a subprotocol —
 * `new WebSocket(url, ["bearer", "<token>"])` — which the server
 * recognizes and echoes `"bearer"` back to complete negotiation (RFC
 * 6455). This reuses `authHeader` rather than adding a second auth
 * mechanism: the `Bearer ` prefix (if present) is stripped to recover
 * the bare token for the subprotocol list.
 */

import { BackendError, type BackendErrorKind, toBackendError } from "../errors";
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
	 * Override `WebSocket`; useful for tests and for runtimes where the
	 * global isn't present. When omitted the transport reads
	 * `globalThis.WebSocket` the first time something subscribes.
	 */
	webSocket?: WebSocketCtor;
	/**
	 * Backoff schedule for reconnecting the shared WebSocket after it
	 * drops. `EventSource`'s auto-reconnect used to come free; owning a
	 * plain `WebSocket` means owning this too. Delays grow
	 * `initialDelayMs * multiplier ^ attempt`, capped at `maxDelayMs`, and
	 * reset to `initialDelayMs` after the next successful `open`.
	 */
	wsReconnect?: WebSocketReconnectOptions;
}

export interface WebSocketReconnectOptions {
	/** Delay before the first reconnect attempt, in ms. Default `1000`. */
	initialDelayMs?: number;
	/** Ceiling for the backoff delay, in ms. Default `30000`. */
	maxDelayMs?: number;
	/** Multiplier applied to the delay after each failed attempt. Default `2`. */
	multiplier?: number;
}

/**
 * Minimal `Event` surface — local mirror so we don't depend on the
 * global DOM `Event` type. Used only as an opaque value passed to
 * `onerror`.
 */
export interface EventLike {
	readonly type: string;
}

/**
 * Minimal `CloseEvent` surface — local mirror of the bits `onclose`
 * actually reads.
 */
export interface CloseEventLike {
	readonly code: number;
	readonly reason: string;
	readonly wasClean: boolean;
}

/**
 * Minimal `MessageEvent` surface — local mirror used by the WebSocket
 * dispatch path. We only read `.data`; every frame the server sends is a
 * text frame, so on a spec-compliant `WebSocket` that's always a string.
 */
export interface MessageEventLike {
	readonly data: unknown;
}

/**
 * Minimal `WebSocket` constructor surface we depend on. Matches the web
 * spec's `WebSocket(url, protocols?)` signature; intentionally narrow
 * (property-assignment handlers, not `addEventListener`) so a fake in
 * tests needs no DOM lib and plugs in cleanly, and so `globalThis.WebSocket`
 * itself satisfies it structurally with no cast beyond the one below.
 */
export type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocketLike;

/** Minimal `WebSocket` instance surface — only what the transport touches. */
export interface WebSocketLike {
	onopen: ((this: WebSocketLike, ev: EventLike) => unknown) | null;
	onclose: ((this: WebSocketLike, ev: CloseEventLike) => unknown) | null;
	onerror: ((this: WebSocketLike, ev: EventLike) => unknown) | null;
	onmessage: ((this: WebSocketLike, ev: MessageEventLike) => unknown) | null;
	close(code?: number, reason?: string): void;
}

/**
 * Client-offered WebSocket subprotocol marker preceding the token —
 * mirrors `desktop-bff::auth::WS_AUTH_SUBPROTOCOL`. See the module doc's
 * "Auth" section.
 */
const WS_AUTH_SUBPROTOCOL = "bearer";

/** Envelope version this client understands (`desktop-bff/src/ws.rs`'s `ENVELOPE_VERSION`). */
const ENVELOPE_VERSION = 1;

const DEFAULT_RECONNECT: Required<WebSocketReconnectOptions> = {
	initialDelayMs: 1_000,
	maxDelayMs: 30_000,
	multiplier: 2,
};

/**
 * SDK channel name → wire `channel` tag. Every channel the WebSocket
 * stream can actually serve is listed here; anything else (e.g.
 * `app:deep-link`) falls through to the no-op branch in `subscribe`.
 */
const WS_CHANNEL_BY_SDK_CHANNEL: Record<string, WsChannel> = {
	domain_event: "domain",
	agent_event: "agent",
};

type WsChannel = "domain" | "agent";

export function httpTransport(opts: HttpTransportOptions): Transport {
	const prefix = opts.apiPrefix ?? "/api/v1";
	const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
	const base = opts.baseUrl.replace(/\/+$/, "");

	async function authHeaders(): Promise<Record<string, string>> {
		const value = opts.authHeader ? await opts.authHeader() : null;
		return value ? { Authorization: value } : {};
	}

	async function wsProtocols(): Promise<string[] | undefined> {
		const value = opts.authHeader ? await opts.authHeader() : null;
		return value ? [WS_AUTH_SUBPROTOCOL, extractBearerToken(value)] : undefined;
	}

	// One pool per transport instance. `subscribe('domain_event' | 'agent_event', ...)`
	// reuses a single underlying `WebSocket` across all renderer handlers,
	// on either channel; the last `unsubscribe()` tears the connection down.
	const ws = new WsConnectionPool(
		() => resolveWsUrl(base, `${prefix}/ws`),
		() => resolveWebSocketCtor(opts.webSocket),
		wsProtocols,
		{ ...DEFAULT_RECONNECT, ...opts.wsReconnect },
	);

	return {
		kind: "http",

		/**
		 * `POST {base}{prefix}/{command}`. Response handling branches on
		 * `Content-Type` (checked, not assumed): `application/json` is
		 * parsed and returned as `T`; anything else is read as raw bytes
		 * and returned as `Array.from(new Uint8Array(bytes))` — a plain
		 * `number[]`, the same shape Tauri's `invoke` produces for a
		 * `Vec<u8>` return value, so a call site typed against
		 * `Promise<number[] | null>` (e.g. `blobs.read`) sees an identical
		 * shape from either transport. Today only `blobs_read`'s found-case
		 * response (`Content-Type: application/octet-stream`) takes this
		 * path — see `desktop-bff/src/routes/blobs.rs`'s doc comment on
		 * `blobs_read` for why that route can't just be `Json<Vec<u8>>`.
		 *
		 * Error responses: a 401 fires `onUnauthenticated` and throws
		 * `unauthenticated` before any content-type branching. Every other
		 * non-2xx tries to parse a JSON `{kind, message}` body
		 * (`ApiError::into_response`'s shape) and throws it as a
		 * `BackendError`. Some routes encode "resource not found" as a
		 * bare 404 with an *empty* body rather than a JSON envelope
		 * (`blobs_read`'s missing-blob case, and — incidentally — any
		 * command with no BFF route at all, which axum 404s before ever
		 * reaching `ApiError`) — when the body doesn't parse as JSON, the
		 * thrown error's `kind` is derived from the HTTP status instead of
		 * collapsing to `"other"` (see `statusToErrorKind`), so callers
		 * that want "missing resource" to mean `null` (like `blobs.read`)
		 * can do that themselves by catching `kind === "not-found"` — this
		 * method never silently turns a non-2xx into a success.
		 */
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
				throw toBackendError(payload ?? { kind: statusToErrorKind(response.status), message: response.statusText });
			}
			const contentType = response.headers.get("content-type") ?? "";
			if (contentType.includes("application/json")) {
				return (await response.json()) as T;
			}
			const bytes = await response.arrayBuffer();
			return Array.from(new Uint8Array(bytes)) as T;
		},

		subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
			const wsChannel = WS_CHANNEL_BY_SDK_CHANNEL[channel];
			if (!wsChannel) {
				// Mirror tauriTransport's posture for a channel it can't
				// serve: don't throw — the SDK's `events()` helper
				// subscribes to several channels at boot and only some are
				// reachable from each transport.
				console.warn(
					`[httpTransport] subscribe '${channel}' is a no-op — the BFF's WebSocket only exposes 'domain_event' and 'agent_event'.`,
				);
				return () => undefined;
			}
			return ws.add(wsChannel, handler as (payload: unknown) => void);
		},
	};
}

/** Maps an HTTP status to the {@link BackendErrorKind} `ApiError::status()` derived it from, for responses whose body didn't parse as the JSON error envelope. */
function statusToErrorKind(status: number): BackendErrorKind {
	switch (status) {
		case 400:
			return "invalid-input";
		case 401:
			return "unauthenticated";
		case 404:
			return "not-found";
		default:
			return "other";
	}
}

/** Strips an optional `"Bearer "` prefix to recover the bare token `authHeader` wraps for the `Authorization` header. */
function extractBearerToken(headerValue: string): string {
	const trimmed = headerValue.trim();
	const match = /^Bearer\s+(.+)$/i.exec(trimmed);
	return match?.[1] ?? trimmed;
}

function resolveWebSocketCtor(override: WebSocketCtor | undefined): WebSocketCtor {
	if (override) return override;
	const g = globalThis as unknown as { WebSocket?: WebSocketCtor };
	if (!g.WebSocket) {
		throw new BackendError(
			"other",
			"httpTransport.subscribe requires a global `WebSocket` — pass `webSocket:` in HttpTransportOptions when running outside a browser.",
		);
	}
	return g.WebSocket;
}

/**
 * `http(s)://...` → `ws(s)://...` (same host/port/path), and an absolute
 * `ws(s)://` base is passed through unchanged. A relative `baseUrl`
 * (`"/"`, `""`, or a mount path — same-origin usage) is resolved against
 * `globalThis.location`; that requires a browser-like global, so pass an
 * absolute `baseUrl` when constructing this transport outside one (tests,
 * Node).
 */
function resolveWsUrl(base: string, path: string): string {
	if (/^http:\/\//i.test(base)) return `ws://${base.slice("http://".length)}${path}`;
	if (/^https:\/\//i.test(base)) return `wss://${base.slice("https://".length)}${path}`;
	if (/^wss?:\/\//i.test(base)) return `${base}${path}`;
	const loc = (globalThis as unknown as { location?: { protocol: string; host: string } }).location;
	if (!loc) {
		throw new BackendError(
			"other",
			`httpTransport: cannot resolve relative baseUrl ${JSON.stringify(base)} to a WebSocket URL without a global \`location\` — pass an absolute http(s)/ws(s) baseUrl.`,
		);
	}
	const scheme = loc.protocol === "https:" ? "wss:" : "ws:";
	return `${scheme}//${loc.host}${base}${path}`;
}

interface WsFrame {
	v: number;
	channel: WsChannel;
	event: unknown;
}

function isWsFrame(value: unknown): value is WsFrame {
	if (!value || typeof value !== "object") return false;
	const obj = value as Record<string, unknown>;
	return typeof obj.v === "number" && (obj.channel === "domain" || obj.channel === "agent") && "event" in obj;
}

type Handler = (payload: unknown) => void;

/**
 * Connection pool for the BFF's single WebSocket endpoint. Holds at most
 * one `WebSocket` open and ref-counts subscribers (across *both* wire
 * channels — `domain` and `agent` share one socket) so:
 *
 * - Every `subscribe('domain_event' | 'agent_event', ...)` call shares
 *   one connection.
 * - Unsubscribing the last handler (on either channel) closes it.
 *
 * Subscribers are keyed by a unique `symbol` per call (not stored in a
 * `Set<Handler>`) so two callers passing the *same* function reference
 * register independently — otherwise `Set`'s reference-equality collapse
 * would mean one caller's unsubscribe tears down the other caller's
 * registration too, and may close the socket while it's still in use.
 *
 * Reconnect: unlike `EventSource`, a plain `WebSocket` never reconnects
 * itself. `onclose` schedules a retry through `resolveUrl` / `resolveCtor`
 * / `resolveProtocols` again (so a rotated token or a `location` change
 * is picked up) with the configured exponential backoff, reset to the
 * initial delay after the next successful `onopen`. A `resolveCtor()`
 * failure (no `WebSocket` global, no override — a permanent
 * configuration problem, not a transient network one) is logged and does
 * *not* schedule a retry.
 */
class WsConnectionPool {
	private socket: WebSocketLike | null = null;
	private readonly subscribers = new Map<symbol, { channel: WsChannel; handler: Handler }>();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private attempt = 0;
	/** Bumped on every `teardown()` so a stale in-flight `open()` (from a superseded attempt) recognizes it should no-op instead of resurrecting a closed pool. */
	private generation = 0;
	private active = false;

	constructor(
		private readonly resolveUrl: () => string,
		private readonly resolveCtor: () => WebSocketCtor,
		private readonly resolveProtocols: () => Promise<string[] | undefined>,
		private readonly backoff: Required<WebSocketReconnectOptions>,
	) {}

	add(channel: WsChannel, handler: Handler): () => void {
		const token = Symbol("httpTransport.wsSubscriber");
		this.subscribers.set(token, { channel, handler });

		if (!this.active) {
			this.active = true;
			this.attempt = 0;
			void this.open(this.generation);
		}

		let removed = false;
		return () => {
			if (removed) return;
			removed = true;
			this.subscribers.delete(token);
			if (this.subscribers.size === 0) this.teardown();
		};
	}

	private async open(generation: number): Promise<void> {
		if (generation !== this.generation || !this.active) return;

		let Ctor: WebSocketCtor;
		try {
			Ctor = this.resolveCtor();
		} catch (err) {
			// No WebSocket implementation available at all — permanent
			// configuration error, not a transient network failure,
			// so we log once and do not reschedule.
			console.error("[httpTransport] WebSocket unavailable:", err);
			return;
		}

		let protocols: string[] | undefined;
		try {
			protocols = await this.resolveProtocols();
		} catch (err) {
			console.error("[httpTransport] resolving WebSocket auth failed:", err);
			this.scheduleReconnect(generation);
			return;
		}
		// Superseded (unsubscribed, or torn down and re-subscribed) while
		// awaiting the auth token — bail without touching `this.socket`.
		if (generation !== this.generation || !this.active) return;

		let socket: WebSocketLike;
		try {
			socket = protocols ? new Ctor(this.resolveUrl(), protocols) : new Ctor(this.resolveUrl());
		} catch (err) {
			console.error("[httpTransport] WebSocket construction failed:", err);
			this.scheduleReconnect(generation);
			return;
		}

		socket.onopen = () => {
			this.attempt = 0;
		};
		socket.onmessage = (ev) => this.dispatch(ev);
		socket.onerror = (ev) => {
			// The close that follows (per spec, `error` precedes `close`
			// on a failed/dropped connection) is what actually schedules
			// the reconnect; this is just for visibility.
			console.warn("[httpTransport] WebSocket error event:", ev);
		};
		socket.onclose = (ev) => {
			if (this.socket !== socket) return; // already superseded
			this.socket = null;
			if (!this.active || generation !== this.generation) return; // deliberate teardown
			console.warn("[httpTransport] WebSocket closed; reconnecting:", ev);
			this.scheduleReconnect(generation);
		};
		this.socket = socket;
	}

	private scheduleReconnect(generation: number): void {
		if (!this.active || generation !== this.generation) return;
		const delay = Math.min(
			this.backoff.initialDelayMs * this.backoff.multiplier ** this.attempt,
			this.backoff.maxDelayMs,
		);
		this.attempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.open(generation);
		}, delay);
	}

	private dispatch(ev: MessageEventLike): void {
		const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			console.warn("[httpTransport] dropping unparseable WS frame:", err, raw);
			return;
		}
		if (!isWsFrame(parsed) || parsed.v !== ENVELOPE_VERSION) {
			console.warn("[httpTransport] dropping WS frame with unexpected shape:", parsed);
			return;
		}
		// Snapshot subscribers so an `unsubscribe()` mid-dispatch doesn't
		// trip the iteration.
		for (const { channel, handler } of [...this.subscribers.values()]) {
			if (channel !== parsed.channel) continue;
			try {
				handler(parsed.event);
			} catch (err) {
				console.error("[httpTransport] subscriber threw:", err);
			}
		}
	}

	private teardown(): void {
		this.active = false;
		this.generation += 1;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.socket) {
			const socket = this.socket;
			this.socket = null;
			socket.onopen = null;
			socket.onmessage = null;
			socket.onerror = null;
			socket.onclose = null;
			socket.close();
		}
	}
}
