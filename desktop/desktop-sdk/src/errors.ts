/**
 * Error envelope shared by every transport. Mirrors `DesktopError` on the
 * Rust side — `kind` is the discriminator, `message` is human-readable.
 */

export type BackendErrorKind = "io" | "invalid-input" | "not-found" | "daemon" | "agent" | "unauthenticated" | "other";

export class BackendError extends Error {
	readonly kind: BackendErrorKind;
	constructor(kind: BackendErrorKind, message: string) {
		super(message);
		this.kind = kind;
		this.name = "BackendError";
	}
}

/**
 * Normalises whatever the transport threw into a {@link BackendError}.
 * Recognises:
 *   - `{ kind, message }` objects (Rust `DesktopError` JSON)
 *   - JS `Error`-shaped values
 *   - bare strings
 */
export function toBackendError(raw: unknown): BackendError {
	if (raw instanceof BackendError) return raw;
	if (raw && typeof raw === "object") {
		const obj = raw as { kind?: unknown; message?: unknown };
		const kind: BackendErrorKind = typeof obj.kind === "string" ? (obj.kind as BackendErrorKind) : "other";
		const message = typeof obj.message === "string" ? obj.message : JSON.stringify(raw);
		return new BackendError(kind, message);
	}
	if (typeof raw === "string") return new BackendError("other", raw);
	return new BackendError("other", String(raw));
}
