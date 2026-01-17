export type MediaObject = {
	secure_url: string;
	url: string;
	height: number;
	width: number;
	asset_id: string;
	format: string;
	public_id: string;
	version_id: string;
	name: string;
	bytes: number;
};

export type ImageObject = MediaObject;
export type VideoObject = MediaObject;

async function getImageSize(
	file: File,
): Promise<{ width: number; height: number }> {
	try {
		const bitmap = await createImageBitmap(file);
		return { width: bitmap.width, height: bitmap.height };
	} catch {
		return { width: 0, height: 0 };
	}
}

async function getVideoSize(
	file: File,
): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.onloadedmetadata = () => {
			resolve({ width: video.videoWidth ?? 0, height: video.videoHeight ?? 0 });
			URL.revokeObjectURL(video.src);
		};
		video.onerror = () => {
			resolve({ width: 0, height: 0 });
			URL.revokeObjectURL(video.src);
		};
		video.src = URL.createObjectURL(file);
	});
}

export const uploadToBlob = async (
	file: File,
	_type = "image",
	context: { spaceId: string; docId?: string },
): Promise<MediaObject> => {
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const { stageBlob } = await import("../services/blob-service");
		const staged = await stageBlob({
			bytes,
			mime: file.type || "application/octet-stream",
			fileName: file.name,
			spaceId: context.spaceId,
			docId: context.docId,
		});

		const { width, height } =
			_type === "video"
				? await getVideoSize(file)
				: _type === "image"
					? await getImageSize(file)
					: { width: 0, height: 0 };

		return {
			secure_url: staged.url,
			width,
			height,
			url: staged.url,
			asset_id: staged.cid,
			format: file.type || "application/octet-stream",
			public_id: staged.cid,
			version_id: String(staged.createdAtMs),
			name: file.name,
			bytes: staged.byteLength,
		};
	} catch (error) {
		return Promise.reject(error);
	}
};
