import {
	Elements,
	useYooptaEditor,
	useYooptaPluginOptions,
} from "@yoopta/editor";
import { pickSingleFile } from "../../../utils/file-picker";
import type {
	VideoElementProps,
	VideoPluginElements,
	VideoPluginOptions,
} from "../types";
import { limitSizes } from "../utils/limitSizes";

type Props = {
	onClose: () => void;
	blockId: string;
	accept?: string;
	onSetLoading: (_s: boolean) => void;
};

const FileUploader = ({
	accept = "video/*",
	onClose,
	blockId,
	onSetLoading,
}: Props) => {
	const options = useYooptaPluginOptions<VideoPluginOptions>("Video");
	const editor = useYooptaEditor();

	const pickAndUpload = async () => {
		const file = await pickSingleFile({ accept: options?.accept || accept });
		if (!file) return;
		await upload(file);
	};

	const upload = async (file: File) => {
		if (!options?.onUpload) {
			throw new Error(
				"onUpload not provided in plugin options. Check Video.extend({}) method",
			);
		}
		onClose();
		onSetLoading(true);

		try {
			// [TODO] - abort controller?
			const data = await options?.onUpload(file);
			const defaultVideoProps = editor.plugins.Video.elements.video
				.props as VideoElementProps;
			const sizes = data.sizes || defaultVideoProps.sizes;
			const maxSizes = (editor.plugins.Image.options as VideoPluginOptions)
				?.maxSizes;
			const limitedSizes = limitSizes(sizes!, {
				width: maxSizes!.maxWidth!,
				height: maxSizes!.maxHeight!,
			});

			Elements.updateElement<VideoPluginElements, VideoElementProps>(
				editor,
				blockId,
				{
					type: "video",
					props: {
						src: data.src,
						sizes: limitedSizes,
						bgColor: data.bgColor || defaultVideoProps.bgColor,
						fit: data.fit || defaultVideoProps.fit || "cover",
						settings: data.settings || defaultVideoProps.settings,
						poster: data.poster || defaultVideoProps.poster,
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
			className="yoo-video-user-select-none yoo-video-transition-bg yoo-video-duration-20 yoo-video-ease-in yoo-video-white-space-nowrap yoo-video-rounded-[4px] yoo-video-h-[32px] yoo-video-px-[12px] yoo-video-border yoo-video-border-solid yoo-video-border-[rgba(55,53,47,0.16)] yoo-video-w-full yoo-video-cursor-pointer yoo-video-text-[14px] yoo-video-leading-[1.2] yoo-video-font-medium yoo-video-flex yoo-video-items-center yoo-video-justify-center yoo-video-bg-white"
			onClick={pickAndUpload}
			type="button"
		>
			Upload video
		</button>
	);
};

export { FileUploader };
