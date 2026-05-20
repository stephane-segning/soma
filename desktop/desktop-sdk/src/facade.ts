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
	readonly dbStorage: ReturnType<typeof dbStorage>;
	readonly documents: ReturnType<typeof documents>;
	readonly events: ReturnType<typeof events>;
	readonly pages: ReturnType<typeof pages>;
	readonly practice: ReturnType<typeof practice>;
	readonly search: ReturnType<typeof search>;
	readonly settings: ReturnType<typeof settings>;
	readonly spaces: ReturnType<typeof spaces>;
	readonly windowControls: ReturnType<typeof windowControls>;
}

export function createBackend(transport: Transport): Backend {
	return {
		transport,
		agent: agent(transport),
		blobs: blobs(transport),
		daemon: daemon(transport),
		dbStorage: dbStorage(transport),
		documents: documents(transport),
		events: events(transport),
		pages: pages(transport),
		practice: practice(transport),
		search: search(transport),
		settings: settings(transport),
		spaces: spaces(transport),
		windowControls: windowControls(transport),
	};
}
