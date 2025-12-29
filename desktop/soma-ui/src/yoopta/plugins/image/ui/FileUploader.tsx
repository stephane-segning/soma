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
			className="yoo-image-user-select-none yoo-image-transition-bg yoo-image-duration-20 yoo-image-ease-in yoo-image-white-space-nowrap yoo-image-rounded-[4px] yoo-image-h-[32px] yoo-image-px-[12px] yoo-image-border yoo-image-border-solid yoo-image-border-[rgba(55,53,47,0.16)] yoo-image-w-full yoo-image-cursor-pointer yoo-image-text-[14px] yoo-image-leading-[1.2] yoo-image-font-medium yoo-image-flex yoo-image-items-center yoo-image-justify-center yoo-image-bg-white"
			onClick={pickAndUpload}
			type="button"
		>
			Upload image
		</button>
	);
};

export { FileUploader };
