/**
 * Backend facade. Take a transport at boot, hand the renderer a grouped
 * call surface. Renderer never sees the transport directly.
 */

import { agent } from "./api/agent";
import { blobs } from "./api/blobs";
import { daemon } from "./api/daemon";
import { documents, pages } from "./api/documents";
import { practice } from "./api/practice";
import { search } from "./api/search";
import { spaces } from "./api/spaces";
import { dbStorage, settings } from "./api/storage";
import { windowControls } from "./api/window";
import { events } from "./events";
import type { Transport } from "./transport";

export interface Backend {
	readonly transport: Transport;
	readonly agent: ReturnType<typeof agent>;
	readonly blobs: ReturnType<typeof blobs>;
	readonly daemon: ReturnType<typeof daemon>;
	readonly documents: ReturnType<typeof documents>;
	readonly events: ReturnType<typeof events>;
	readonly pages: ReturnType<typeof pages>;
	readonly practice: ReturnType<typeof practice>;
	readonly search: ReturnType<typeof search>;
	readonly spaces: ReturnType<typeof spaces>;
	/**
	 * `window_control`-backed native window chrome (minimize/maximize/
	 * close). There is no browser equivalent — a web page cannot minimize
	 * or resize its own window — and no BFF route exists for it (see
	 * `desktop-bff::routes`: `window_control` isn't mounted). Populated
	 * only under `tauriTransport`; `undefined` under `httpTransport`, so a
	 * web-reachable call site gets a compile-time nudge
	 * (`backend.windowControls?.minimize()`) instead of a route that
	 * always 404s at runtime.
	 */
	readonly windowControls: ReturnType<typeof windowControls> | undefined;
	/**
	 * `db_storage_*` / `settings_*`-backed KV bridges. Like
	 * `windowControls`, `desktop-bff` mounts no route for either family —
	 * there's no server-side store behind them over HTTP today — so both
	 * are populated only under `tauriTransport`. See `windowControls`'s
	 * doc comment for the reasoning; it applies identically here.
	 */
	readonly dbStorage: ReturnType<typeof dbStorage> | undefined;
	readonly settings: ReturnType<typeof settings> | undefined;
}

export function createBackend(transport: Transport): Backend {
	const isTauri = transport.kind === "tauri";
	return {
		transport,
		agent: agent(transport),
		blobs: blobs(transport),
		daemon: daemon(transport),
		documents: documents(transport),
		events: events(transport),
		pages: pages(transport),
		practice: practice(transport),
		search: search(transport),
		spaces: spaces(transport),
		windowControls: isTauri ? windowControls(transport) : undefined,
		dbStorage: isTauri ? dbStorage(transport) : undefined,
		settings: isTauri ? settings(transport) : undefined,
	};
}
