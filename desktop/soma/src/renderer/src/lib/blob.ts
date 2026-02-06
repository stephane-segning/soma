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
	variants?: {
		cid: string;
		size: number;
		mime: string;
		name: string;
		url: string;
		width?: number;
		height?: number;
	}[];
};

export type ImageObject = MediaObject;
export type VideoObject = MediaObject;

async function getImageSize(file: File): Promise<{
	width: number;
	height: number;
}> {
	try {
		const bitmap = await createImageBitmap(file);
		return {
			width: bitmap.width,
			height: bitmap.height,
		};
	} catch {
		return {
			width: 0,
			height: 0,
		};
	}
}

async function getVideoSize(file: File): Promise<{
	width: number;
	height: number;
}> {
	return new Promise((resolve) => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.onloadedmetadata = () => {
			resolve({
				width: video.videoWidth ?? 0,
				height: video.videoHeight ?? 0,
			});
			URL.revokeObjectURL(video.src);
		};
		video.onerror = () => {
			resolve({
				width: 0,
				height: 0,
			});
			URL.revokeObjectURL(video.src);
		};
		video.src = URL.createObjectURL(file);
	});
}

export const uploadToBlob = async (
	file: File,
	_type = "image",
	context: {
		spaceId: string;
		docId?: string;
	},
): Promise<MediaObject> => {
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const { awaitUploadJob, queueUploadJob } = await import("../services/upload-outbox");
		const jobId = await queueUploadJob({
			bytes,
			mime: file.type || "application/octet-stream",
			fileName: file.name,
			spaceId: context.spaceId,
			docId: context.docId,
		});
		const job = await awaitUploadJob(jobId);
		if (!job.result) {
			throw new Error("Upload job completed without result");
		}

		const { width, height } =
			_type === "video"
				? await getVideoSize(file)
				: _type === "image"
					? await getImageSize(file)
					: {
							width: 0,
							height: 0,
						};

		return {
			secure_url: job.result.url,
			width,
			height,
			url: job.result.url,
			asset_id: job.result.cid,
			format: job.result.mime,
			public_id: job.result.cid,
			version_id: String(job.updatedAtMs),
			name: job.result.name ?? file.name,
			bytes: job.result.size,
			variants: job.result.variants,
		};
	} catch (error) {
		return Promise.reject(error);
	}
};
