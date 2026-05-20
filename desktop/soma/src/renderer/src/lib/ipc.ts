/**
 * Single backend instance for the renderer. Sits between the rest of the
 * app and `@soma/sdk`; today it's wired to `electronTransport()` (the
 * preload bridge that ships with the Electron shell). When this renderer
 * eventually runs inside the Tauri shell, the only change is to swap
 * `electronTransport()` for `tauriTransport()` here.
 *
 * Two surfaces are exported:
 *  - `backend`  — typed grouped API (`backend.spaces.list({...})`, ...).
 *    New code should use this.
 *  - `invoke()` + `windowControls` — back-compat helpers used by the
 *    existing services/. They forward through `backend.transport.invoke`
 *    so we don't have to migrate every call site in one pass.
 */

import { createBackend, electronTransport } from "@soma/sdk";

export const backend = createBackend(electronTransport());

export async function invoke<T = unknown>(channel: string, args?: unknown): Promise<T> {
	return backend.transport.invoke<T>(channel, (args as Record<string, unknown>) ?? {});
}

export const windowControls = backend.windowControls;
