/**
 * `@soma/sdk` — single typed surface between the renderer and the
 * backend. Today only the Tauri transport is available; the HTTP
 * transport lands with the future BFF binary.
 *
 * Usage:
 * ```ts
 * import { createBackend, tauriTransport } from "@soma/sdk";
 * const backend = createBackend(tauriTransport());
 * await backend.spaces.list({ limit: 25 });
 * ```
 */

// Re-export every wire type the API surface accepts or returns so callers
// import from one place.
export * from "./bindings";
export { BackendError, type BackendErrorKind, toBackendError } from "./errors";
export { type Backend, createBackend } from "./facade";
export type { Transport } from "./transport";
export { type ElectronPreloadBridge, type ElectronTransportOptions, electronTransport } from "./transport/electron";
export { type HttpTransportOptions, httpTransport } from "./transport/http";
export { tauriTransport } from "./transport/tauri";
