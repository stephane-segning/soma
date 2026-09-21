/**
 * The renderer's single backend instance. Picks the transport at boot:
 * `tauriTransport` inside the Tauri webview, `httpTransport` against
 * `desktop-bff` in a plain browser tab (`pnpm run build:web` /
 * `pnpm run dev:web` — see `vite.config.ts` and `package.json`).
 */

import { createBackend, httpTransport, tauriTransport } from "@soma/sdk";
import { isTauri } from "@tauri-apps/api/core";

/**
 * `desktop-bff`'s own origin. Not a secret — it's deployment topology —
 * so a build-time env var is the right home for it, set when running
 * `build:web` / `dev:web` (e.g. `VITE_SOMA_BFF_URL=http://127.0.0.1:4123`
 * in `.env.local`, or in the shell environment). Falls back to
 * same-origin (`""`) for a reverse proxy fronting the static bundle and
 * `desktop-bff` under one origin.
 */
const BFF_BASE_URL = (import.meta.env.VITE_SOMA_BFF_URL as string | undefined)?.trim() || "";

/**
 * `sessionStorage` key the BFF bearer token is cached under. Chosen over
 * `localStorage` so the token doesn't outlive the tab.
 */
const BFF_TOKEN_STORAGE_KEY = "soma.bffToken";

/**
 * Lifts a `?token=` query param into `sessionStorage` and strips it from
 * the URL, so `desktop-bff`'s one-time `https://host/?token=<token>`
 * link (see `resolveBffToken`'s doc comment) leaves nothing sensitive in
 * the address bar, browser history, or a `Referer` header past this
 * point.
 *
 * Must run eagerly, at module-evaluation time — not lazily inside
 * `authHeader`. `router.tsx`'s `rootRedirectLoader` calls
 * `redirect("/spaces")` as part of the router's *own* construction,
 * which happens before React ever renders or runs an effect; that
 * `history.replaceState` drops the entire query string (a redirect
 * target is a fresh path, not a patch onto the current URL). Reading
 * the token from `window.location` lazily — the first time some
 * component's effect actually calls a backend method — loses the race:
 * by then the redirect has already fired and `?token=` is gone. Calling
 * this once at the top of this module wins the race instead, because
 * `backend.ts` is imported (transitively, via `command-palette-root.tsx`)
 * ahead of `router.tsx` in the renderer's actual module graph, so it
 * evaluates first.
 */
function captureBffTokenFromUrl(): void {
	const url = new URL(window.location.href);
	const token = url.searchParams.get("token");
	if (!token) return;
	try {
		window.sessionStorage.setItem(BFF_TOKEN_STORAGE_KEY, token);
	} catch (err) {
		console.warn("[backend] failed to persist BFF token to sessionStorage:", err);
	}
	url.searchParams.delete("token");
	window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Resolves the bearer token `httpTransport`'s `authHeader` hook needs.
 * There is deliberately no login form here — that would be a second auth
 * mechanism. Instead whoever runs `desktop-bff` hands out a one-time
 * link of the form `https://host/?token=<token>`; `captureBffTokenFromUrl`
 * (above) lifts it into `sessionStorage` once, at boot, and this just
 * reads the cached value back on every call.
 */
function resolveBffToken(): string | null {
	try {
		return window.sessionStorage.getItem(BFF_TOKEN_STORAGE_KEY);
	} catch {
		return null;
	}
}

function clearBffToken(): void {
	try {
		window.sessionStorage.removeItem(BFF_TOKEN_STORAGE_KEY);
	} catch {
		// best-effort cleanup only
	}
}

function createTransport() {
	if (isTauri()) return tauriTransport();
	captureBffTokenFromUrl();
	return httpTransport({
		baseUrl: BFF_BASE_URL,
		authHeader: () => {
			const token = resolveBffToken();
			return token ? `Bearer ${token}` : null;
		},
		onUnauthenticated: () => {
			clearBffToken();
			console.error(
				"[backend] desktop-bff rejected the session (expired or invalid token) — reload with a fresh ?token= link.",
			);
		},
	});
}

export const backend = createBackend(createTransport());
export type { Backend, BackendError, BackendErrorKind } from "@soma/sdk";
