/**
 * The single seam between the SDK's API surface and whatever IPC layer is
 * underneath. Two implementations ship with the SDK today:
 *
 * - {@link tauriTransport}  — `@tauri-apps/api` invoke + listen (desktop).
 * - {@link httpTransport}   — fetch + WebSocket (`desktop-bff`, and the web build).
 *
 * Renderer code never references either directly; it asks for a
 * `createBackend(transport)` value at boot and uses the resulting facade
 * everywhere.
 */

export interface Transport {
	/**
	 * Which concrete implementation this is. Not used by `invoke`/`subscribe`
	 * call sites — it exists so `createBackend` can decide, once, whether to
	 * populate command groups that have no BFF route at all (`windowControls`,
	 * `dbStorage`, `settings` — see `facade.ts`) rather than exposing a
	 * namespace that would 404 on every call under `httpTransport`.
	 */
	readonly kind: "tauri" | "http";

	/** Run a server-side command and resolve with its typed result. */
	invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;

	/**
	 * Subscribe to a named event channel. Returns a synchronous unsubscribe
	 * function — the implementation may resolve the listener registration
	 * asynchronously, but the return value is eagerly usable.
	 */
	subscribe<T>(channel: string, handler: (payload: T) => void): () => void;
}

export type { Transport as Default };
