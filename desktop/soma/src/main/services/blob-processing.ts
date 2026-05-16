import JSZip from "jszip";

export type BlobZipResult = {
	name: string;
	data: Buffer;
};

export async function zipFile(fileName: string, buffer: Buffer): Promise<BlobZipResult> {
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

function toZipName(fileName: string): string {
	if (fileName.toLowerCase().endsWith(".zip")) return fileName;
	const dotIndex = fileName.lastIndexOf(".");
	const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName || "file";
	return `${baseName}.zip`;
}
