/**
 * Unit tests for `createBackend`'s per-transport command-group gating.
 * See `Backend.windowControls`'s doc comment in `facade.ts` for why
 * `windowControls` / `dbStorage` / `settings` are conditional: none of
 * the three has a `desktop-bff` route, so exposing them under
 * `httpTransport` would mean a namespace that always fails at runtime
 * instead of a compile-time signal that it isn't available.
 */

import { describe, expect, it } from "vitest";
import { createBackend } from "./facade";
import type { Transport } from "./transport";

function fakeTransport(kind: Transport["kind"]): Transport {
	return {
		kind,
		invoke: async () => undefined as never,
		subscribe: () => () => undefined,
	};
}

describe("createBackend", () => {
	it("exposes windowControls, dbStorage, and settings under the Tauri transport", () => {
		const backend = createBackend(fakeTransport("tauri"));

		expect(backend.windowControls).toBeDefined();
		expect(backend.dbStorage).toBeDefined();
		expect(backend.settings).toBeDefined();
	});

	it("omits windowControls, dbStorage, and settings under the HTTP transport", () => {
		const backend = createBackend(fakeTransport("http"));

		expect(backend.windowControls).toBeUndefined();
		expect(backend.dbStorage).toBeUndefined();
		expect(backend.settings).toBeUndefined();
	});

	it("exposes every transport-agnostic command group under both transport kinds", () => {
		for (const kind of ["tauri", "http"] as const) {
			const backend = createBackend(fakeTransport(kind));
			expect(backend.agent).toBeDefined();
			expect(backend.blobs).toBeDefined();
			expect(backend.daemon).toBeDefined();
			expect(backend.documents).toBeDefined();
			expect(backend.events).toBeDefined();
			expect(backend.pages).toBeDefined();
			expect(backend.practice).toBeDefined();
			expect(backend.search).toBeDefined();
			expect(backend.spaces).toBeDefined();
		}
	});
});
