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

// TODO
async function saveObjectInMainProcess(
	_fd: FormData,
): Promise<Record<string, any>> {
	throw Error("unimplemented");
}

export const uploadToBlob = async (
	file: File,
	_type = "image",
): Promise<MediaObject> => {
	const formData = new FormData();
	formData.append("file", file);

	try {
		const response = await saveObjectInMainProcess(formData);

		return {
			secure_url: response.secure_url,
			width: response.width,
			height: response.height,
			url: response.url,
			asset_id: response.asset_id,
			format: response.format,
			public_id: response.public_id,
			version_id: response.version_id,
			name: response.original_filename,
			bytes: response.bytes,
		};
	} catch (error) {
		return Promise.reject(error);
	}
};
