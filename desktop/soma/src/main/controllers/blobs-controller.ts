import { zipFile } from "../services/blob-processing";
import type { DaemonClient } from "../services/daemon-client";
import type {
	StageUploadPayloadParams,
	StageUploadPayloadResult,
	UploadPayloadStore,
} from "../services/upload-payload-store";

export type BlobStageParams = {
	spaceId: string;
	docId?: string;
	bytes: number[];
	mime: string;
	fileName?: string;
};

export type BlobStageFromPayloadParams = {
	spaceId: string;
	docId?: string;
	payloadPath: string;
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

const ZIP_MIME = "application/zip";

export class BlobsController {
	constructor(
		private readonly daemon: DaemonClient,
		private readonly uploadPayloadStore: UploadPayloadStore,
	) {}

	stagePayload(params: StageUploadPayloadParams): Promise<StageUploadPayloadResult> {
		return this.uploadPayloadStore.stage(params);
	}

	async stage(params: BlobStageParams): Promise<BlobStageResult> {
		const buffer = Buffer.from(params.bytes);
		if (params.mime.startsWith("image/")) {
			return this.stageImage(params, buffer);
		}
		return this.stageFile(params, buffer);
	}

	async stageFromPayload(params: BlobStageFromPayloadParams): Promise<BlobStageResult> {
		const buffer = await this.uploadPayloadStore.read(params.payloadPath);
		const result = await this.stage({
			spaceId: params.spaceId,
			docId: params.docId,
			bytes: Array.from(buffer),
			mime: params.mime,
			fileName: params.fileName,
		});
		await this.uploadPayloadStore.remove(params.payloadPath);
		return result;
	}

	private async stageImage(params: BlobStageParams, buffer: Buffer): Promise<BlobStageResult> {
		const res = await this.daemon.uploadBlob({
			spaceId: params.spaceId,
			docId: params.docId,
			mime: params.mime,
			name: params.fileName ?? "image",
			bytes: Array.from(buffer),
		});

		return {
			cid: res.cid,
			size: res.size,
			mime: res.mime,
			name: res.name,
			url: `soma-blob://daemon/${params.spaceId}/${res.cid}`,
		};
	}

	private async stageFile(params: BlobStageParams, buffer: Buffer): Promise<BlobStageResult> {
		const originalName = params.fileName ?? "file";
		const zipped = await zipFile(originalName, buffer);
		const res = await this.daemon.uploadBlob({
			spaceId: params.spaceId,
			docId: params.docId,
			mime: ZIP_MIME,
			name: zipped.name,
			bytes: Array.from(zipped.data),
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
