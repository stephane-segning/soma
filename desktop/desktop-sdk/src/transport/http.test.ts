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
import type { EventSourceLike } from "./http";
import { httpTransport } from "./http";

class FakeEventSource implements EventSourceLike {
	static instances: FakeEventSource[] = [];
	readonly url: string;
	readonly init?: EventSourceInit;
	readyState = 1;
	onopen: ((this: EventSourceLike, ev: Event) => unknown) | null = null;
	onerror: ((this: EventSourceLike, ev: Event) => unknown) | null = null;
	private listeners = new Map<string, Set<(ev: MessageEvent) => void>>();
	closed = false;

	constructor(url: string, init?: EventSourceInit) {
		this.url = url;
		this.init = init;
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (ev: MessageEvent) => void): void {
		let set = this.listeners.get(type);
		if (!set) {
			set = new Set();
			this.listeners.set(type, set);
		}
		set.add(listener);
	}

	removeEventListener(type: string, listener: (ev: MessageEvent) => void): void {
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
		const ev = { data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent;
		for (const l of set) l(ev);
	}

	/** Test helper: fire the spec-level `error` event. */
	error(): void {
		this.onerror?.call(this, new Event("error"));
	}
}

function freshTransport() {
	FakeEventSource.instances = [];
	return httpTransport({
		baseUrl: "http://test.invalid",
		eventSource: FakeEventSource as unknown as new (url: string, init?: EventSourceInit) => EventSourceLike,
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
