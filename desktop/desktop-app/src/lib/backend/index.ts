/**
 * Public facade. Renderer code consumes the `backend` namespace as a
 * single grouped object — `backend.spaces.list()`, `backend.daemon.status()`,
 * etc. — so import sites stay readable and the boundary between TS and
 * Rust is obvious at every call.
 */

import { agent } from "./agent";
import { blobs } from "./blobs";
import { call } from "./client";
import { daemon } from "./daemon";
import { documents, pages } from "./documents";
import { events } from "./events";
import { search } from "./search";
import { spaces } from "./spaces";
import { dbStorage, settings } from "./storage";
import { windowControls } from "./window";

export { BackendError } from "./client";
export * from "./types";

export const backend = {
	agent,
	blobs,
	daemon,
	dbStorage,
	documents,
	events,
	pages,
	search,
	settings,
	spaces,
	windowControls,
	/** Escape hatch — prefer the grouped methods above when possible. */
	invoke: call,
} as const;

export type Backend = typeof backend;
