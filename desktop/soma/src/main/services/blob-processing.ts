import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

export type BlobImageVariantInput = {
	name: string;
	data: Buffer;
};

export type BlobImageVariant = {
	name: string;
	data: Buffer;
	width?: number;
	height?: number;
};

export type BlobZipResult = {
	name: string;
	data: Buffer;
};

const IMAGE_VARIANT_WIDTHS = [320, 640, 1024];

export async function createImageVariants(
	fileName: string,
	buffer: Buffer,
): Promise<BlobImageVariant[]> {
	const variants: BlobImageVariant[] = [];

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

			variants.push({
				name: appendNameSuffix(fileName, `@${targetWidth}w`),
				data,
				width: info.width,
				height: info.height,
			});
		}
	} catch {
		return variants;
	}

	return variants;
}

export async function zipFile(
	fileName: string,
	buffer: Buffer,
): Promise<BlobZipResult> {
	const zip = new JSZip();
	zip.file(fileName, buffer);

	const zipped = await zip.generateAsync({
		type: "nodebuffer",
		compression: "DEFLATE",
	});

	return {
		name: toZipName(fileName),
		data: zipped,
	};
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
