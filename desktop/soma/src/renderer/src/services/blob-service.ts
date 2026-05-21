/**
 * Renderer-side blob service. Thin adapter over `@soma/sdk`'s
 * `backend.blobs.stage(...)` — no IPC channel names live here anymore.
 *
 * The SDK returns the raw Tauri/Electron shape (`size`, `name`); this module
 * does the rename to the renderer's preferred `byteLength` / `fileName` and
 * stamps the local `createdAtMs` clock that consumers expect.
 */

import type { StageBlobResult } from "@soma/sdk";

import { backend } from "../lib/ipc";

export type StagedBlob = {
	cid: string;
	mime: string;
	byteLength: number;
	createdAtMs: number;
	url: string;
	fileName?: string;
	variants?: NonNullable<StageBlobResult["variants"]>;
};

export async function stageBlob(input: {
	bytes: Uint8Array;
	mime: string;
	fileName?: string;
	spaceId: string;
	docId?: string;
}): Promise<StagedBlob> {
	const response = await backend.blobs.stage({
		spaceId: input.spaceId,
		docId: input.docId,
		bytes: Array.from(input.bytes),
		mime: input.mime,
		fileName: input.fileName,
	});

	return {
		cid: response.cid,
		mime: response.mime,
		byteLength: response.size,
		createdAtMs: Date.now(),
		url: response.url,
		fileName: response.name,
		variants: response.variants ?? undefined,
	};
}
