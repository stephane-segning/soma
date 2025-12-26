export type StagedBlob = {
	cid: string;
	mime: string;
	byteLength: number;
	createdAtMs: number;
	url: string;
	fileName?: string;
};

import { invoke } from "@tauri-apps/api/core";

export async function stageBlob(input: {
	bytes: Uint8Array;
	mime: string;
	fileName?: string;
	spaceId: string;
	docId?: string;
}): Promise<StagedBlob> {
	const response = await invoke<{
		cid: string;
		size: string | number;
		mime: string;
		name: string;
	}>("blobs_stage", {
		spaceId: input.spaceId,
		docId: input.docId,
		bytes: Array.from(input.bytes),
		mime: input.mime,
		fileName: input.fileName,
	});

	const blob = new Blob([input.bytes], { type: input.mime });
	const url = URL.createObjectURL(blob);

	return {
		cid: response.cid,
		mime: response.mime,
		byteLength:
			typeof response.size === "string"
				? Number.parseInt(response.size, 10)
				: response.size,
		createdAtMs: Date.now(),
		url,
		fileName: input.fileName,
	};
}
