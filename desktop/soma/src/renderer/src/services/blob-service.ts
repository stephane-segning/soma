export type StagedBlob = {
	cid: string;
	mime: string;
	byteLength: number;
	createdAtMs: number;
	url: string;
	fileName?: string;
};

import { invoke } from "../lib/ipc";

export async function stageBlob(input: {
	bytes: Uint8Array;
	mime: string;
	fileName?: string;
	spaceId: string;
	docId?: string;
}): Promise<StagedBlob> {
	const response = await invoke<{
		cid: string;
		size: number;
		mime: string;
		name: string;
		url: string;
	}>("blobs_stage", {
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
		fileName: input.fileName,
	};
}
