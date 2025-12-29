import {
	Elements,
	useYooptaEditor,
	useYooptaPluginOptions,
} from "@yoopta/editor";
import { pickSingleFile } from "../../../utils/file-picker";
import type {
	FileElementProps,
	FilePluginElements,
	FilePluginOptions,
} from "../types";

type Props = {
	onClose: () => void;
	blockId: string;
	accept?: string;
	onSetLoading: (_s: boolean) => void;
};

const FileUploader = ({
	accept = "",
	onClose,
	blockId,
	onSetLoading,
}: Props) => {
	const options = useYooptaPluginOptions<FilePluginOptions>("File");
	const editor = useYooptaEditor();

	const pickAndUpload = async () => {
		const file = await pickSingleFile({ accept: options?.accept || accept });
		if (!file) return;
		await upload(file);
	};

	const upload = async (file: File) => {
		if (!options?.onUpload) {
			throw new Error(
				"onUpload not provided in plugin options. Check File.extend({}) method",
			);
		}
		onClose();
		onSetLoading(true);

		try {
			// [TODO] - abort controller?
			const response = await options?.onUpload(file);

			Elements.updateElement<FilePluginElements, FileElementProps>(
				editor,
				blockId,
				{
					type: "file",
					props: {
						src: response.src,
						name: response.name || file.name,
						size: response.size || file.size,
						format: response.format,
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
			className="yoo-file-user-select-none yoo-file-transition-bg yoo-file-duration-20 yoo-file-ease-in yoo-file-white-space-nowrap yoo-file-rounded-[4px] yoo-file-h-[32px] yoo-file-px-[12px] yoo-file-border yoo-file-border-solid yoo-file-border-[rgba(55,53,47,0.16)] yoo-file-w-full yoo-file-cursor-pointer yoo-file-text-[14px] yoo-file-leading-[1.2] yoo-file-font-medium yoo-file-flex yoo-file-items-center yoo-file-justify-center yoo-file-bg-white"
			onClick={pickAndUpload}
			type="button"
		>
			Upload file
		</button>
	);
};

export { FileUploader };
