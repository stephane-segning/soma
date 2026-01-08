import {
	Elements,
	useYooptaEditor,
	useYooptaPluginOptions,
} from "@yoopta/editor";
import { pickSingleFile } from "../../../utils/file-picker";
import type {
	ImageElementProps,
	ImagePluginElements,
	ImagePluginOptions,
} from "../types";
import { limitSizes } from "../utils/limitSizes";

type Props = {
	onClose: () => void;
	blockId: string;
	accept?: string;
	onSetLoading: (_s: boolean) => void;
};

const FileUploader = ({
	accept = "image/*",
	onClose,
	blockId,
	onSetLoading,
}: Props) => {
	const options = useYooptaPluginOptions<ImagePluginOptions>("Image");
	const editor = useYooptaEditor();

	const pickAndUpload = async () => {
		const file = await pickSingleFile({ accept: options?.accept || accept });
		if (!file) return;
		await upload(file);
	};

	const upload = async (file: File) => {
		if (!options?.onUpload) {
			console.warn("onUpload not provided");
			return;
		}
		onClose();
		onSetLoading(true);

		try {
			const data = await options?.onUpload(file);
			const defaultImageProps = editor.plugins.Image.elements.image
				.props as ImageElementProps;
			const sizes = data.sizes || defaultImageProps.sizes;
			const maxSizes = (editor.plugins.Image.options as ImagePluginOptions)
				?.maxSizes;
			const limitedSizes = limitSizes(sizes!, {
				width: maxSizes!.maxWidth!,
				height: maxSizes!.maxHeight!,
			});

			Elements.updateElement<ImagePluginElements, ImageElementProps>(
				editor,
				blockId,
				{
					type: "image",
					props: {
						src: data.src,
						alt: data.alt,
						sizes: limitedSizes,
						bgColor: data.bgColor || defaultImageProps.bgColor,
						fit: data.fit || defaultImageProps.fit || "fill",
					},
				},
			);
		} catch (error) {
			options?.onError?.(error);
		} finally {
			onSetLoading(false);
		}
	};

	return (
		<button
			className="user-select-none transition-bg duration-20 ease-in white-space-nowrap rounded-[4px] h-[32px] px-[12px] border border-solid border-[rgba(55,53,47,0.16)] w-full cursor-pointer text-[14px] leading-[1.2] font-medium flex items-center justify-center bg-white"
			onClick={pickAndUpload}
			type="button"
		>
			Upload image
		</button>
	);
};

export { FileUploader };
