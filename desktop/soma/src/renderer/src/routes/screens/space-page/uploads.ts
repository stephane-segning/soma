import { uploadToBlob } from "@app/lib/blob";
import { useCallback } from "react";
import type { PageBlobContext } from "./types";

export type BlobImageAttrs = {
	cid: string;
	src: string;
	sources:
		| {
				src: string;
				alt: string;
				width?: number;
				height?: number;
		  }[]
		| null;
	mime: string;
	size: number;
	name: string;
	width: number;
	height: number;
};

export type BlobFileAttrs = {
	cid: string;
	href: string;
	mime: string;
	size: number;
	name: string;
};

export function pickFiles(options: { accept?: string; multiple?: boolean }): Promise<File[]> {
	return new Promise<File[]>((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = options.accept ?? "";
		input.multiple = options.multiple ?? false;
		input.onchange = () => {
			const files = input.files ? Array.from(input.files) : [];
			resolve(files);
			input.remove();
		};
		input.click();
	});
}

export function usePageUploads({ spaceId, pageId }: PageBlobContext): {
	uploadImage: (file: File) => Promise<BlobImageAttrs>;
	uploadFile: (file: File) => Promise<BlobFileAttrs>;
} {
	const uploadImage = useCallback(
		async (file: File): Promise<BlobImageAttrs> => {
			const staged = await uploadToBlob(file, "image", {
				spaceId,
				docId: pageId,
			});

			const sources =
				staged.variants && staged.variants.length > 0
					? [
							{
								src: staged.url,
								alt: staged.name,
								width: staged.width,
								height: staged.height,
							},
							...staged.variants.map((variant) => ({
								src: variant.url,
								alt: variant.name,
								width: variant.width,
								height: variant.height,
							})),
						]
					: null;

			return {
				cid: staged.asset_id,
				src: staged.url,
				sources,
				mime: staged.format,
				size: staged.bytes,
				name: staged.name,
				width: staged.width,
				height: staged.height,
			};
		},
		[pageId, spaceId],
	);

	const uploadFile = useCallback(
		async (file: File): Promise<BlobFileAttrs> => {
			const staged = await uploadToBlob(file, "file", {
				spaceId,
				docId: pageId,
			});

			return {
				cid: staged.asset_id,
				href: staged.url,
				mime: staged.format,
				size: staged.bytes,
				name: staged.name,
			};
		},
		[pageId, spaceId],
	);

	return { uploadFile, uploadImage };
}
