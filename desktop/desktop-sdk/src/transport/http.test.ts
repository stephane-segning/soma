/**
 * Unit tests for `httpTransport.subscribe`.
 *
 * The transport accepts a fake `EventSource` constructor through
 * `HttpTransportOptions.eventSource`, so we drive the SSE behaviour
 * deterministically without a real network round-trip. A live
 * smoke test against `desktop-bff` lives in
 * `desktop/desktop-bff/tests/sse.rs` and is run via `cargo test`.
 */

import { describe, expect, it, vi } from "vitest";
import type { EventLike, EventSourceCtor, EventSourceInitLike, EventSourceLike, MessageEventLike } from "./http";
import { httpTransport } from "./http";

class FakeEventSource implements EventSourceLike {
	static instances: FakeEventSource[] = [];
	readonly url: string;
	readonly init?: EventSourceInitLike;
	readyState = 1;
	onopen: ((this: EventSourceLike, ev: EventLike) => unknown) | null = null;
	onerror: ((this: EventSourceLike, ev: EventLike) => unknown) | null = null;
	private listeners = new Map<string, Set<(ev: MessageEventLike) => void>>();
	closed = false;

	constructor(url: string, init?: EventSourceInitLike) {
		this.url = url;
		this.init = init;
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
		let set = this.listeners.get(type);
		if (!set) {
			set = new Set();
			this.listeners.set(type, set);
		}
		set.add(listener);
	}

	removeEventListener(type: string, listener: (ev: MessageEventLike) => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	close(): void {
		this.closed = true;
		this.readyState = 2;
	}

	/** Test helper: deliver an SSE frame. */
	emit(type: string, data: unknown): void {
		const set = this.listeners.get(type);
		if (!set) return;
		const ev: MessageEventLike = { data: typeof data === "string" ? data : JSON.stringify(data) };
		for (const l of set) l(ev);
	}

	/** Test helper: fire the spec-level `error` event. */
	error(): void {
		this.onerror?.call(this, { type: "error" });
	}
}

const FakeEventSourceCtor = FakeEventSource as unknown as EventSourceCtor;

function freshTransport(opts: { withCredentials?: boolean } = {}) {
	FakeEventSource.instances = [];
	return httpTransport({
		baseUrl: "http://test.invalid",
		eventSource: FakeEventSourceCtor,
		...(opts.withCredentials !== undefined ? { withCredentials: opts.withCredentials } : {}),
	});
}

describe("httpTransport.subscribe", () => {
	it("opens an EventSource against /api/v1/events and dispatches domain_event payloads", () => {
		const t = freshTransport();
		const handler = vi.fn();

		const unsubscribe = t.subscribe<{ kind: string; documentId: string }>("domain_event", handler);

		expect(FakeEventSource.instances).toHaveLength(1);
		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");
		expect(es.url).toBe("http://test.invalid/api/v1/events");
		expect(es.init?.withCredentials).toBe(true);

		const payload = { kind: "document-changed", documentId: "doc-1" };
		es.emit("domain_event", payload);
		expect(handler).toHaveBeenCalledWith(payload);

		unsubscribe();
		expect(es.closed).toBe(true);
	});

	it("shares a single EventSource across multiple subscribers and closes only on the last unsubscribe", () => {
		const t = freshTransport();
		const a = vi.fn();
		const b = vi.fn();

		const unA = t.subscribe("domain_event", a);
		const unB = t.subscribe("domain_event", b);

		expect(FakeEventSource.instances).toHaveLength(1);
		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");

		es.emit("domain_event", { kind: "pages-changed" });
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);

		unA();
		expect(es.closed).toBe(false);

		// Surviving subscriber still receives subsequent frames.
		es.emit("domain_event", { kind: "document-changed" });
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(2);

		unB();
		expect(es.closed).toBe(true);
	});

	it("ignores SSE frames that aren't valid JSON without crashing the pump", () => {
		const t = freshTransport();
		const handler = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const unsub = t.subscribe("domain_event", handler);
		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");

		es.emit("domain_event", "not-json-{");
		es.emit("domain_event", { kind: "document-changed" });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenLastCalledWith({ kind: "document-changed" });
		expect(warn).toHaveBeenCalled();

		unsub();
		warn.mockRestore();
	});

	it("isolates subscriber exceptions so one throw doesn't break the rest", () => {
		const t = freshTransport();
		const bad = vi.fn(() => {
			throw new Error("boom");
		});
		const good = vi.fn();
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const unA = t.subscribe("domain_event", bad);
		const unB = t.subscribe("domain_event", good);

		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");
		es.emit("domain_event", { kind: "document-changed" });

		expect(bad).toHaveBeenCalled();
		expect(good).toHaveBeenCalled();
		expect(err).toHaveBeenCalled();

		unA();
		unB();
		err.mockRestore();
	});

	it("warns and returns a no-op unsubscribe for channels the BFF doesn't expose", () => {
		const t = freshTransport();
		const handler = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const unsub = t.subscribe("agent_event", handler);

		expect(FakeEventSource.instances).toHaveLength(0);
		expect(warn).toHaveBeenCalled();
		expect(() => unsub()).not.toThrow();
		warn.mockRestore();
	});

	it("registers each subscribe independently even when callers pass the same handler reference", () => {
		// Regression: previously the pool stored handlers in a `Set`,
		// so two subscribes with the same function reference collapsed
		// into one entry and the first unsubscribe tore down the
		// shared registration (closing the EventSource while the
		// second caller was still active).
		const t = freshTransport();
		const shared = vi.fn();

		const unA = t.subscribe("domain_event", shared);
		const unB = t.subscribe("domain_event", shared);

		expect(FakeEventSource.instances).toHaveLength(1);
		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");

		es.emit("domain_event", { kind: "pages-changed" });
		// Both registrations fire — one frame, two deliveries.
		expect(shared).toHaveBeenCalledTimes(2);

		unA();
		// One registration left, so the EventSource must stay open.
		expect(es.closed).toBe(false);

		es.emit("domain_event", { kind: "document-changed" });
		expect(shared).toHaveBeenCalledTimes(3);

		unB();
		expect(es.closed).toBe(true);
	});

	it("does not leak a handler registration when the EventSource ctor throws", () => {
		// Regression: previously `add()` inserted the handler into the
		// `Set` *before* constructing the EventSource, so a ctor throw
		// (missing global, polyfill bug, bad URL) left a stale handler
		// that subsequent successful subscribes would dispatch to.
		FakeEventSource.instances = [];
		let firstCall = true;
		const ThrowingCtor: EventSourceCtor = function (this: unknown, url: string, init?: EventSourceInitLike) {
			if (firstCall) {
				firstCall = false;
				throw new Error("ctor blew up");
			}
			return new FakeEventSource(url, init);
		} as unknown as EventSourceCtor;

		const t = httpTransport({
			baseUrl: "http://test.invalid",
			eventSource: ThrowingCtor,
		});

		const ghost = vi.fn();
		expect(() => t.subscribe("domain_event", ghost)).toThrow("ctor blew up");

		// Second subscribe succeeds — the ghost handler from the
		// failed first attempt must NOT receive events.
		const live = vi.fn();
		const unsub = t.subscribe("domain_event", live);
		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");

		es.emit("domain_event", { kind: "document-changed" });
		expect(live).toHaveBeenCalledTimes(1);
		expect(ghost).not.toHaveBeenCalled();

		unsub();
		expect(es.closed).toBe(true);
	});

	it("threads HttpTransportOptions.withCredentials into the EventSource init", () => {
		const t = freshTransport({ withCredentials: false });
		const unsub = t.subscribe("domain_event", vi.fn());

		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");
		expect(es.init?.withCredentials).toBe(false);

		unsub();
	});

	it("logs but does not close on transport errors (EventSource auto-reconnects)", () => {
		const t = freshTransport();
		const handler = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const unsub = t.subscribe("domain_event", handler);
		const es = FakeEventSource.instances[0];
		if (!es) throw new Error("expected EventSource to be constructed");

		es.error();
		expect(es.closed).toBe(false);
		expect(warn).toHaveBeenCalled();

		// After the spec-defined reconnect the next frame still reaches the handler.
		es.emit("domain_event", { kind: "document-changed" });
		expect(handler).toHaveBeenCalledTimes(1);

		unsub();
		warn.mockRestore();
	});
});
