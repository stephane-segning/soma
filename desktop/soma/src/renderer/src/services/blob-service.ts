export async function stageBlob(input: {
	bytes: Uint8Array;
	mime: string;
	fileName?: string;
}) {
	return window.api.blobs.stage(input);
}

