export type BlobImageUploadResult = {
	cid: string;
	src: string;
	mime: string;
	size: number;
	name?: string;
	width?: number;
	height?: number;
	variants?: {
		cid: string;
		url: string;
		mime: string;
		size: number;
		name: string;
		width?: number;
		height?: number;
	}[];
};

export type BlobImageOptions = {
	upload: (file: File) => Promise<BlobImageUploadResult>;
};
