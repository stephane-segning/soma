/**
 * The renderer's single backend instance. Picks the transport at boot
 * (Tauri today; in the future a `window.location` check could route to
 * `httpTransport({ baseUrl: "/" })` for a browser-only build).
 */

import { createBackend, tauriTransport } from "@soma/sdk";

export const backend = createBackend(tauriTransport());
export type { Backend, BackendError, BackendErrorKind } from "@soma/sdk";
