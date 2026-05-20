/**
 * Thin typed wrapper around Tauri V2's `invoke()`. Centralises the error
 * envelope returned by `desktop_core::DesktopError` so every domain module
 * can call `client.call("foo", args)` without re-stringifying errors.
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type DesktopErrorKind = "io" | "invalid-input" | "not-found" | "daemon" | "agent" | "other";

export class BackendError extends Error {
	readonly kind: DesktopErrorKind;
	constructor(kind: DesktopErrorKind, message: string) {
		super(message);
		this.kind = kind;
		this.name = "BackendError";
	}
}

function asBackendError(raw: unknown): BackendError {
	if (raw && typeof raw === "object" && "kind" in raw && "message" in raw) {
		const obj = raw as { kind?: unknown; message?: unknown };
		const kind = typeof obj.kind === "string" ? (obj.kind as DesktopErrorKind) : "other";
		const message = typeof obj.message === "string" ? obj.message : String(raw);
		return new BackendError(kind, message);
	}
	return new BackendError("other", typeof raw === "string" ? raw : ((raw as Error)?.message ?? String(raw)));
}

/**
 * Type-safe `invoke()` that surfaces backend errors as `BackendError`.
 * Used by every `backend/*.ts` module — keep your domain modules thin so
 * this stays the only place that touches `@tauri-apps/api`.
 */
export async function call<R>(command: string, args?: Record<string, unknown>): Promise<R> {
	try {
		return await tauriInvoke<R>(command, args ?? {});
	} catch (err) {
		throw asBackendError(err);
	}
}
