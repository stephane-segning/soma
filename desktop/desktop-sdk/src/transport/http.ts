/**
 * HTTP / SSE implementation of {@link Transport}. Targets the future BFF
 * binary (`desktop-bff`) so the same SDK can run in a plain browser.
 *
 * Wire shape (mirrors the design proposal):
 * - Commands → `POST {baseUrl}/api/v1/<command_name>` with JSON body.
 *   Responses are JSON; non-2xx maps to {@link BackendError}.
 * - Events  → `GET  {baseUrl}/api/v1/events/<channel>` over SSE; each
 *   message is a JSON-encoded payload.
 *
 * Today this transport throws on subscribe() because the BFF doesn't
 * exist yet. The invoke path is implemented so unit tests / a partial
 * BFF can drive the SDK.
 */

import { BackendError, toBackendError } from "../errors";
import type { Transport } from "./index";

export interface HttpTransportOptions {
	/** e.g. `https://soma.example.com` or `/` (same-origin). */
	baseUrl: string;
	/** Returns the value of the `Authorization` header, or `null` for unauthenticated. */
	authHeader?: () => Promise<string | null> | string | null;
	/** API version prefix; defaults to `/api/v1`. */
	apiPrefix?: string;
	/** Hook invoked when a request returns 401, before the original error is thrown. */
	onUnauthenticated?: () => void;
	/** Override `fetch`; useful for tests. */
	fetch?: typeof globalThis.fetch;
}

export function httpTransport(opts: HttpTransportOptions): Transport {
	const prefix = opts.apiPrefix ?? "/api/v1";
	const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
	const base = opts.baseUrl.replace(/\/+$/, "");

	async function authHeaders(): Promise<Record<string, string>> {
		const value = opts.authHeader ? await opts.authHeader() : null;
		return value ? { Authorization: value } : {};
	}

	return {
		async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
			let response: Response;
			try {
				response = await fetchImpl(`${base}${prefix}/${command}`, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...(await authHeaders()) },
					body: JSON.stringify(args),
					credentials: "include",
				});
			} catch (err) {
				throw toBackendError(err);
			}
			if (response.status === 401) {
				opts.onUnauthenticated?.();
				throw new BackendError("unauthenticated", "session expired");
			}
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				throw toBackendError(payload ?? { kind: "other", message: response.statusText });
			}
			return (await response.json()) as T;
		},

		subscribe<T>(channel: string, _handler: (payload: T) => void): () => void {
			// SSE wiring lands with the BFF — for now we fail loudly so callers
			// know they need a transport that supports streaming when running
			// against a remote backend.
			throw new BackendError(
				"other",
				`httpTransport.subscribe('${channel}') is not yet implemented — the BFF doesn't expose SSE endpoints.`,
			);
		},
	};
}
