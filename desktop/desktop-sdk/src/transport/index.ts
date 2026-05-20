/**
 * The single seam between the SDK's API surface and whatever IPC layer is
 * underneath. Two implementations ship with the SDK today:
 *
 * - {@link tauriTransport}  — `@tauri-apps/api` invoke + listen (desktop).
 * - {@link httpTransport}   — fetch + SSE (planned BFF).
 *
 * Renderer code never references either directly; it asks for a
 * `createBackend(transport)` value at boot and uses the resulting facade
 * everywhere.
 */

export interface Transport {
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
