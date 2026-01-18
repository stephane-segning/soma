import { DaemonClient } from "../services/daemon-client";

export type BlobStageParams = {
	spaceId: string;
	docId?: string;
	bytes: number[];
	mime: string;
	fileName?: string;
};

export type BlobStageResult = {
	cid: string;
	size: number;
	mime: string;
	name: string;
	url: string;
};

export class BlobsController {
	constructor(private readonly daemon: DaemonClient) {}

	async stage(params: BlobStageParams): Promise<BlobStageResult> {
		const res = await this.daemon.uploadBlob({
			spaceId: params.spaceId,
			docId: params.docId,
			mime: params.mime,
			name: params.fileName ?? "blob",
			bytes: params.bytes,
		});

		return {
			cid: res.cid,
			size: res.size,
			mime: res.mime,
			name: res.name,
			url: `soma-blob://daemon/${params.spaceId}/${res.cid}`,
		};
	}
}
