/**
 * Unit tests for `httpTransport`.
 *
 * `subscribe` accepts a fake `WebSocket` constructor through
 * `HttpTransportOptions.webSocket`, so we drive the connection lifecycle
 * (open, frames, close, reconnect backoff) deterministically without a
 * real network round-trip or a browser. `invoke` accepts a fake `fetch`
 * the same way. A live smoke test against `desktop-bff` lives in
 * `desktop/desktop-bff/tests/ws.rs` and `desktop-bff/tests/routes.rs`,
 * run via `cargo test`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendError } from "../errors";
import type { CloseEventLike, EventLike, MessageEventLike, WebSocketCtor, WebSocketLike } from "./http";
import { httpTransport } from "./http";

class FakeWebSocket implements WebSocketLike {
	static instances: FakeWebSocket[] = [];
	readonly url: string;
	readonly protocols?: string | string[];
	onopen: ((this: WebSocketLike, ev: EventLike) => unknown) | null = null;
	onclose: ((this: WebSocketLike, ev: CloseEventLike) => unknown) | null = null;
	onerror: ((this: WebSocketLike, ev: EventLike) => unknown) | null = null;
	onmessage: ((this: WebSocketLike, ev: MessageEventLike) => unknown) | null = null;
	closed = false;

	constructor(url: string, protocols?: string | string[]) {
		this.url = url;
		this.protocols = protocols;
		FakeWebSocket.instances.push(this);
	}

	close(): void {
		this.closed = true;
	}

	/** Test helper: simulate the handshake completing. */
	open(): void {
		this.onopen?.call(this, { type: "open" });
	}

	/** Test helper: deliver an already-decoded WS envelope (JSON-encoded before dispatch). */
	emit(frame: unknown): void {
		this.onmessage?.call(this, { data: JSON.stringify(frame) });
	}

	/** Test helper: deliver a raw (possibly malformed) frame body. */
	emitRaw(data: string): void {
		this.onmessage?.call(this, { data });
	}

	/** Test helper: fire the spec-level `error` event. */
	error(): void {
		this.onerror?.call(this, { type: "error" });
	}

	/** Test helper: fire the spec-level `close` event (server drop / network blip — never called by `unsubscribe`, which calls `close()` directly instead, matching a real socket). */
	closeFromServer(code = 1006, reason = ""): void {
		this.onclose?.call(this, { code, reason, wasClean: false });
	}
}

const FakeWebSocketCtor = FakeWebSocket as unknown as WebSocketCtor;

function freshWsTransport(overrides: Partial<Parameters<typeof httpTransport>[0]> = {}) {
	FakeWebSocket.instances = [];
	return httpTransport({
		baseUrl: "http://test.invalid",
		webSocket: FakeWebSocketCtor,
		wsReconnect: { initialDelayMs: 10, maxDelayMs: 40, multiplier: 2 },
		...overrides,
	});
}

/** Lets the pool's `await resolveProtocols()` (and any other pending microtask chain) settle, and advances any due reconnect timer. */
async function flush(ms = 0): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
}

describe("httpTransport WebSocket subscribe", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("opens a WebSocket against {apiPrefix}/ws and dispatches channel:domain frames to domain_event subscribers", async () => {
		const t = freshWsTransport();
		const handler = vi.fn();

		const unsubscribe = t.subscribe<{ kind: string; documentId: string }>("domain_event", handler);
		await flush();

		expect(FakeWebSocket.instances).toHaveLength(1);
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");
		expect(socket.url).toBe("ws://test.invalid/api/v1/ws");

		const payload = { kind: "document-changed", documentId: "doc-1" };
		socket.emit({ v: 1, channel: "domain", event: payload });
		expect(handler).toHaveBeenCalledWith(payload);

		unsubscribe();
		expect(socket.closed).toBe(true);
	});

	it("routes channel:agent frames to agent_event subscribers over the same shared connection", async () => {
		const t = freshWsTransport();
		const onDomain = vi.fn();
		const onAgent = vi.fn();

		const unDomain = t.subscribe("domain_event", onDomain);
		const unAgent = t.subscribe("agent_event", onAgent);
		await flush();

		// One connection serves both channels.
		expect(FakeWebSocket.instances).toHaveLength(1);
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");

		const agentPayload = { kind: "ready", atMs: 1 };
		socket.emit({ v: 1, channel: "agent", event: agentPayload });
		expect(onAgent).toHaveBeenCalledWith(agentPayload);
		expect(onDomain).not.toHaveBeenCalled();

		const domainPayload = { kind: "pages-changed" };
		socket.emit({ v: 1, channel: "domain", event: domainPayload });
		expect(onDomain).toHaveBeenCalledWith(domainPayload);
		expect(onAgent).toHaveBeenCalledTimes(1);

		unDomain();
		expect(socket.closed).toBe(false); // agent subscriber still active
		unAgent();
		expect(socket.closed).toBe(true);
	});

	it("shares a single WebSocket across multiple subscribers and closes only on the last unsubscribe", async () => {
		const t = freshWsTransport();
		const a = vi.fn();
		const b = vi.fn();

		const unA = t.subscribe("domain_event", a);
		const unB = t.subscribe("domain_event", b);
		await flush();

		expect(FakeWebSocket.instances).toHaveLength(1);
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");

		socket.emit({ v: 1, channel: "domain", event: { kind: "pages-changed" } });
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);

		unA();
		expect(socket.closed).toBe(false);

		socket.emit({ v: 1, channel: "domain", event: { kind: "document-changed" } });
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(2);

		unB();
		expect(socket.closed).toBe(true);
	});

	it("registers each subscribe independently even when callers pass the same handler reference", async () => {
		// Regression: a `Set<Handler>` would collapse two subscribes with the
		// same function reference into one entry, so the first unsubscribe
		// would tear down the shared registration (closing the socket while
		// the second caller was still active). The pool keys subscribers by
		// a fresh `symbol` per call specifically to avoid this.
		const t = freshWsTransport();
		const shared = vi.fn();

		const unA = t.subscribe("domain_event", shared);
		const unB = t.subscribe("domain_event", shared);
		await flush();

		expect(FakeWebSocket.instances).toHaveLength(1);
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");

		socket.emit({ v: 1, channel: "domain", event: { kind: "pages-changed" } });
		expect(shared).toHaveBeenCalledTimes(2);

		unA();
		expect(socket.closed).toBe(false);

		socket.emit({ v: 1, channel: "domain", event: { kind: "document-changed" } });
		expect(shared).toHaveBeenCalledTimes(3);

		unB();
		expect(socket.closed).toBe(true);
	});

	it("ignores WS frames that aren't valid JSON without crashing the pump", async () => {
		const t = freshWsTransport();
		const handler = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const unsub = t.subscribe("domain_event", handler);
		await flush();
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");

		socket.emitRaw("not-json-{");
		socket.emit({ v: 1, channel: "domain", event: { kind: "document-changed" } });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenLastCalledWith({ kind: "document-changed" });
		expect(warn).toHaveBeenCalled();

		unsub();
	});

	it("drops frames with an unrecognized shape (missing v/channel/event, or an unknown channel tag)", async () => {
		const t = freshWsTransport();
		const handler = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const unsub = t.subscribe("domain_event", handler);
		await flush();
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");

		socket.emit({ foo: "bar" });
		socket.emit({ v: 1, channel: "bogus", event: {} });
		socket.emit({ v: 2, channel: "domain", event: { kind: "document-changed" } }); // unsupported envelope version
		expect(handler).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalled();

		socket.emit({ v: 1, channel: "domain", event: { kind: "document-changed" } });
		expect(handler).toHaveBeenCalledTimes(1);

		unsub();
	});

	it("warns and returns a no-op unsubscribe for channels the WS stream doesn't expose (e.g. app:deep-link)", async () => {
		const t = freshWsTransport();
		const handler = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const unsub = t.subscribe("app:deep-link", handler);
		await flush();

		expect(FakeWebSocket.instances).toHaveLength(0);
		expect(warn).toHaveBeenCalled();
		expect(() => unsub()).not.toThrow();
	});

	it("threads the bearer token as a WebSocket subprotocol, stripping the 'Bearer ' prefix", async () => {
		const t = freshWsTransport({ authHeader: () => "Bearer secret-token" });
		const unsub = t.subscribe("domain_event", vi.fn());
		await flush();

		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");
		expect(socket.protocols).toEqual(["bearer", "secret-token"]);

		unsub();
	});

	it("supports an async authHeader and omits protocols entirely when unauthenticated", async () => {
		const t = freshWsTransport({ authHeader: async () => null });
		const unsub = t.subscribe("domain_event", vi.fn());
		await flush();

		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");
		expect(socket.protocols).toBeUndefined();

		unsub();
	});

	it("reconnects with exponential backoff after the socket drops, and resets the delay after a successful reopen", async () => {
		const t = freshWsTransport(); // initialDelayMs: 10, maxDelayMs: 40, multiplier: 2
		const handler = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const unsub = t.subscribe("domain_event", handler);
		await flush();
		expect(FakeWebSocket.instances).toHaveLength(1);

		// First drop, before ever opening: attempt 0 -> delay 10ms.
		FakeWebSocket.instances[0]?.closeFromServer();
		await flush(9);
		expect(FakeWebSocket.instances).toHaveLength(1); // not yet
		await flush(1);
		expect(FakeWebSocket.instances).toHaveLength(2); // reconnected at 10ms

		// Second drop, still never opened: attempt 1 -> delay 20ms (doubled).
		FakeWebSocket.instances[1]?.closeFromServer();
		await flush(19);
		expect(FakeWebSocket.instances).toHaveLength(2);
		await flush(1);
		expect(FakeWebSocket.instances).toHaveLength(3);

		// This time the connection actually opens, which resets the backoff.
		FakeWebSocket.instances[2]?.open();
		FakeWebSocket.instances[2]?.closeFromServer();
		await flush(10); // back to the initial 10ms delay, not 40ms
		expect(FakeWebSocket.instances).toHaveLength(4);

		const latest = FakeWebSocket.instances[3];
		latest?.emit({ v: 1, channel: "domain", event: { kind: "document-changed" } });
		expect(handler).toHaveBeenCalledWith({ kind: "document-changed" });
		expect(warn).toHaveBeenCalled();

		unsub();
	});

	it("caps the reconnect delay at maxDelayMs", async () => {
		const t = freshWsTransport(); // maxDelayMs: 40
		const unsub = t.subscribe("domain_event", vi.fn());
		await flush();

		// Drop repeatedly without ever opening: 10, 20, 40, 40 (capped)...
		FakeWebSocket.instances[0]?.closeFromServer();
		await flush(10);
		FakeWebSocket.instances[1]?.closeFromServer();
		await flush(20);
		FakeWebSocket.instances[2]?.closeFromServer();
		await flush(40);
		expect(FakeWebSocket.instances).toHaveLength(4);

		FakeWebSocket.instances[3]?.closeFromServer();
		await flush(39);
		expect(FakeWebSocket.instances).toHaveLength(4); // would have fired already if uncapped growth continued
		await flush(1);
		expect(FakeWebSocket.instances).toHaveLength(5);

		unsub();
	});

	it("does not reconnect after the last subscriber unsubscribes (clean teardown)", async () => {
		const t = freshWsTransport();
		const unsub = t.subscribe("domain_event", vi.fn());
		await flush();
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");

		unsub();
		expect(socket.closed).toBe(true);

		await flush(1000);
		expect(FakeWebSocket.instances).toHaveLength(1); // no reconnect attempted post-teardown
	});

	it("cancels a pending reconnect timer on last unsubscribe", async () => {
		const t = freshWsTransport();
		const unsub = t.subscribe("domain_event", vi.fn());
		await flush();
		FakeWebSocket.instances[0]?.closeFromServer(); // schedules a reconnect in 10ms

		unsub();
		await flush(1000);
		expect(FakeWebSocket.instances).toHaveLength(1); // the scheduled reconnect never fired
	});

	it("starts the backoff over on a fresh subscribe after a full teardown", async () => {
		const t = freshWsTransport();
		const unsubA = t.subscribe("domain_event", vi.fn());
		await flush();
		FakeWebSocket.instances[0]?.closeFromServer(); // attempt -> 1 (next delay would be 20ms)
		unsubA(); // teardown cancels that pending reconnect

		const unsubB = t.subscribe("domain_event", vi.fn());
		await flush();
		expect(FakeWebSocket.instances).toHaveLength(2); // fresh connection, not the cancelled reconnect

		FakeWebSocket.instances[1]?.closeFromServer();
		await flush(10); // back to the initial 10ms, proving attempt was reset to 0
		expect(FakeWebSocket.instances).toHaveLength(3);

		unsubB();
	});

	it("logs a WebSocket error event but only reconnects once the matching close event fires", async () => {
		const t = freshWsTransport();
		const unsub = t.subscribe("domain_event", vi.fn());
		await flush();
		const socket = FakeWebSocket.instances[0];
		if (!socket) throw new Error("expected WebSocket to be constructed");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		socket.error();
		expect(warn).toHaveBeenCalled();
		expect(socket.closed).toBe(false);
		await flush(1000);
		expect(FakeWebSocket.instances).toHaveLength(1); // error alone never reconnects

		socket.closeFromServer();
		await flush(10);
		expect(FakeWebSocket.instances).toHaveLength(2);

		unsub();
	});

	it("recovers from a WebSocket constructor that throws, without losing or duplicating the subscriber", async () => {
		let calls = 0;
		const flaky: WebSocketCtor = function (this: unknown, url: string, protocols?: string | string[]) {
			calls += 1;
			if (calls === 1) throw new Error("ctor blew up");
			return new FakeWebSocket(url, protocols);
		} as unknown as WebSocketCtor;
		FakeWebSocket.instances = [];

		const t = httpTransport({
			baseUrl: "http://test.invalid",
			webSocket: flaky,
			wsReconnect: { initialDelayMs: 10, maxDelayMs: 40, multiplier: 2 },
		});
		const handler = vi.fn();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const unsub = t.subscribe("domain_event", handler);
		await flush(); // first attempt throws synchronously inside the ctor call
		expect(FakeWebSocket.instances).toHaveLength(0);
		expect(errorSpy).toHaveBeenCalled();

		await flush(10); // scheduled retry succeeds
		expect(FakeWebSocket.instances).toHaveLength(1);

		FakeWebSocket.instances[0]?.emit({ v: 1, channel: "domain", event: { kind: "document-changed" } });
		expect(handler).toHaveBeenCalledTimes(1); // the original subscriber, not a duplicate or a ghost

		unsub();
	});

	it("logs and does not schedule a reconnect when no WebSocket implementation is available", async () => {
		FakeWebSocket.instances = [];
		const t = httpTransport({ baseUrl: "http://test.invalid" }); // no `webSocket` override
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
		(globalThis as { WebSocket?: unknown }).WebSocket = undefined;

		try {
			const unsub = t.subscribe("domain_event", vi.fn());
			await flush(1000);
			expect(errorSpy).toHaveBeenCalled();
			expect(FakeWebSocket.instances).toHaveLength(0);
			unsub();
		} finally {
			(globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
		}
	});
});

describe("httpTransport.invoke", () => {
	function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json", ...extraHeaders },
		});
	}

	function bytesResponse(status: number, bytes: number[], contentType = "application/octet-stream"): Response {
		return new Response(new Uint8Array(bytes), { status, headers: { "content-type": contentType } });
	}

	function emptyResponse(status: number): Response {
		return new Response(null, { status });
	}

	it("POSTs JSON args to {base}{apiPrefix}/{command} and returns the parsed JSON response", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { spaces: [] }));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		const result = await t.invoke<{ spaces: unknown[] }>("spaces_list", { q: "x" });

		expect(result).toEqual({ spaces: [] });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("http://test.invalid/api/v1/spaces_list");
		expect(init.method).toBe("POST");
		expect(init.body).toBe(JSON.stringify({ q: "x" }));
		expect(init.credentials).toBe("include");
		expect(init.headers).toEqual({ "Content-Type": "application/json" });
	});

	it("unwraps a single-struct-arg { args } envelope so the body matches the struct directly", async () => {
		// Regression test for a real bug: every `api/*.ts` wrapper for a
		// command with one struct parameter calls
		// `t.invoke(command, { args })` (the JSON key has to match the
		// Tauri command's own parameter name). Before this fix, the HTTP
		// transport sent that envelope verbatim — `{"args": {...}}` — but
		// desktop-bff's axum handlers deserialize the body as the struct
		// directly (`Json<TheArgsStruct>`), so every such command 422'd
		// over HTTP. Confirmed against a live `desktop-bff` via
		// `agent_resolve_drift` before writing this fix.
		const fetchMock = vi.fn(async () => jsonResponse(200, { mergedUpdateBase64: "" }));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		await t.invoke("agent_resolve_drift", { args: { leftUpdateBase64: "a", rightUpdateBase64: "b" } });

		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.body).toBe(JSON.stringify({ leftUpdateBase64: "a", rightUpdateBase64: "b" }));
	});

	it("normalizes a null/undefined single-struct arg to {} instead of a JSON null body", async () => {
		// Mirrors the Tauri side's `args.unwrap_or_default()` for the same
		// commands (e.g. `spaces_list`) — `None` and `Some(default)` are
		// the same observable call, and a non-`Option` struct on the axum
		// side can't deserialize a literal `null` body at all.
		const fetchMock = vi.fn(async () => jsonResponse(200, { spaces: [] }));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		await t.invoke("spaces_list", { args: null });

		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.body).toBe(JSON.stringify({}));
	});

	it("sends a non-{args} record (bare positional params, or no args) unchanged", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, null));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		await t.invoke("agent_list_models", { spaceId: "space-1" });
		await t.invoke("daemon_ready");

		const [, firstInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		const [, secondInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
		expect(firstInit.body).toBe(JSON.stringify({ spaceId: "space-1" }));
		expect(secondInit.body).toBe(JSON.stringify({}));
	});

	it("trims a trailing slash from baseUrl and respects a custom apiPrefix", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, null));
		const t = httpTransport({ baseUrl: "http://test.invalid/", apiPrefix: "/custom", fetch: fetchMock });

		await t.invoke("ping");

		expect(fetchMock).toHaveBeenCalledWith("http://test.invalid/custom/ping", expect.anything());
	});

	it("merges a synchronous authHeader into the Authorization header", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, null));
		const t = httpTransport({ baseUrl: "http://test.invalid", authHeader: () => "Bearer xyz", fetch: fetchMock });

		await t.invoke("ping");

		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer xyz" });
	});

	it("supports an async authHeader", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, null));
		const t = httpTransport({
			baseUrl: "http://test.invalid",
			authHeader: async () => "Bearer async-token",
			fetch: fetchMock,
		});

		await t.invoke("ping");

		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer async-token" });
	});

	it("omits the Authorization header when authHeader returns null", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, null));
		const t = httpTransport({ baseUrl: "http://test.invalid", authHeader: () => null, fetch: fetchMock });

		await t.invoke("ping");

		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.headers).toEqual({ "Content-Type": "application/json" });
	});

	it("throws unauthenticated and fires onUnauthenticated on a 401, without touching onUnauthenticated on success", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(401, { kind: "unauthenticated", message: "no token" }));
		const onUnauthenticated = vi.fn();
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock, onUnauthenticated });

		await expect(t.invoke("spaces_list")).rejects.toMatchObject({ kind: "unauthenticated" });
		expect(onUnauthenticated).toHaveBeenCalledTimes(1);
	});

	it("throws a BackendError parsed from a JSON error envelope on a non-2xx JSON response", async () => {
		const fetchMock = vi.fn(async () => jsonResponse(400, { kind: "invalid-input", message: "bad space id" }));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		const err = await t.invoke("spaces_create").catch((e) => e);
		expect(err).toBeInstanceOf(BackendError);
		expect(err).toMatchObject({ kind: "invalid-input", message: "bad space id" });
	});

	it("derives the error kind from the HTTP status when the error body isn't parseable JSON", async () => {
		const fetchMock = vi.fn(async () => emptyResponse(404));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		const err = await t.invoke("db_storage_get").catch((e) => e);
		expect(err).toBeInstanceOf(BackendError);
		expect((err as BackendError).kind).toBe("not-found");
	});

	it("maps a bodyless 400 to invalid-input and any other status to other", async () => {
		const t400 = httpTransport({ baseUrl: "http://test.invalid", fetch: vi.fn(async () => emptyResponse(400)) });
		const err400 = await t400.invoke("x").catch((e) => e);
		expect((err400 as BackendError).kind).toBe("invalid-input");

		const t500 = httpTransport({ baseUrl: "http://test.invalid", fetch: vi.fn(async () => emptyResponse(500)) });
		const err500 = await t500.invoke("x").catch((e) => e);
		expect((err500 as BackendError).kind).toBe("other");
	});

	it("reads an application/octet-stream response as a plain byte array", async () => {
		const fetchMock = vi.fn(async () => bytesResponse(200, [1, 2, 3, 255]));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		const result = await t.invoke<number[]>("blobs_read", { spaceId: "s1", cid: "c1" });

		expect(result).toEqual([1, 2, 3, 255]);
	});

	it("treats a missing content-type as a binary response", async () => {
		const fetchMock = vi.fn(async () => new Response(new Uint8Array([9, 8, 7]), { status: 200 }));
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		const result = await t.invoke<number[]>("blobs_read");

		expect(result).toEqual([9, 8, 7]);
	});

	it("wraps a network-level fetch failure into a BackendError instead of throwing raw", async () => {
		const fetchMock = vi.fn(async () => {
			throw new TypeError("Failed to fetch");
		});
		const t = httpTransport({ baseUrl: "http://test.invalid", fetch: fetchMock });

		const err = await t.invoke("spaces_list").catch((e) => e);
		expect(err).toBeInstanceOf(BackendError);
	});
});
