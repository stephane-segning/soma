import type { DaemonClient } from "../services/daemon-client";
import { createImageVariants, zipFile } from "../services/blob-processing";

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
	variants?: BlobStageVariant[];
};

export type BlobStageVariant = {
	cid: string;
	size: number;
	mime: string;
	name: string;
	url: string;
	width?: number;
	height?: number;
};

const ZIP_MIME = "application/zip";

export class BlobsController {
	constructor(private readonly daemon: DaemonClient) {}

	async stage(params: BlobStageParams): Promise<BlobStageResult> {
		const buffer = Buffer.from(params.bytes);
		if (params.mime.startsWith("image/")) {
			return this.stageImage(params, buffer);
		}
		return this.stageFile(params, buffer);
	}

	private async stageImage(params: BlobStageParams, buffer: Buffer): Promise<BlobStageResult> {
		const res = await this.daemon.uploadBlob({
			spaceId: params.spaceId,
			docId: params.docId,
			mime: params.mime,
			name: params.fileName ?? "image",
			bytes: Array.from(buffer),
		});

		const variants = await this.createImageVariants(params, buffer);

		return {
			cid: res.cid,
			size: res.size,
			mime: res.mime,
			name: res.name,
			url: `soma-blob://daemon/${params.spaceId}/${res.cid}`,
			variants,
		};
	}

	private async createImageVariants(params: BlobStageParams, buffer: Buffer): Promise<BlobStageVariant[]> {
		const variants = await createImageVariants(params.fileName ?? "image", buffer);
		const results: BlobStageVariant[] = [];

		for (const variant of variants) {
			const res = await this.daemon.uploadBlob({
				spaceId: params.spaceId,
				docId: params.docId,
				mime: params.mime,
				name: variant.name,
				bytes: Array.from(variant.data),
			});

			results.push({
				cid: res.cid,
				size: res.size,
				mime: res.mime,
				name: res.name,
				url: `soma-blob://daemon/${params.spaceId}/${res.cid}`,
				width: variant.width,
				height: variant.height,
			});
		}

		return results;
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
