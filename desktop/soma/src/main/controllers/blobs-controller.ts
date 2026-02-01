import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import type { DaemonClient } from "../services/daemon-client";

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

const IMAGE_VARIANT_WIDTHS = [320, 640, 1024];
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
		const variants: BlobStageVariant[] = [];

		try {
			const metadata = await sharp(buffer).metadata();
			const sourceWidth = metadata.width ?? 0;

			for (const targetWidth of IMAGE_VARIANT_WIDTHS) {
				if (!sourceWidth || sourceWidth <= targetWidth) continue;
				const pipeline = sharp(buffer).rotate().resize({
					width: targetWidth,
					withoutEnlargement: true,
				});

				const { data, info } = await pipeline.toBuffer({
					resolveWithObject: true,
				});
				const name = appendNameSuffix(params.fileName ?? "image", `@${targetWidth}w`);
				const res = await this.daemon.uploadBlob({
					spaceId: params.spaceId,
					docId: params.docId,
					mime: params.mime,
					name,
					bytes: Array.from(data),
				});

				variants.push({
					cid: res.cid,
					size: res.size,
					mime: res.mime,
					name: res.name,
					url: `soma-blob://daemon/${params.spaceId}/${res.cid}`,
					width: info.width,
					height: info.height,
				});
			}
		} catch {
			return variants;
		}

		return variants;
	}

	private async stageFile(params: BlobStageParams, buffer: Buffer): Promise<BlobStageResult> {
		const zip = new JSZip();
		const originalName = params.fileName ?? "file";
		zip.file(originalName, buffer);

		const zipped = await zip.generateAsync({
			type: "nodebuffer",
			compression: "DEFLATE",
		});

		const zipName = toZipName(originalName);
		const res = await this.daemon.uploadBlob({
			spaceId: params.spaceId,
			docId: params.docId,
			mime: ZIP_MIME,
			name: zipName,
			bytes: Array.from(zipped),
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

function appendNameSuffix(fileName: string, suffix: string): string {
	const parsed = path.parse(fileName);
	if (!parsed.name) return `${fileName}${suffix}`;
	return path.format({
		...parsed,
		base: "",
		name: `${parsed.name}${suffix}`,
	});
}

function toZipName(fileName: string): string {
	if (fileName.toLowerCase().endsWith(".zip")) return fileName;
	const parsed = path.parse(fileName);
	const baseName = parsed.name || fileName || "file";
	return `${baseName}.zip`;
}
