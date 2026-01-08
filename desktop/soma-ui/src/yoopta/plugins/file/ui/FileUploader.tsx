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
			className="user-select-none transition-bg duration-20 ease-in white-space-nowrap rounded-[4px] h-[32px] px-[12px] border border-solid border-[rgba(55,53,47,0.16)] w-full cursor-pointer text-[14px] leading-[1.2] font-medium flex items-center justify-center bg-white"
			onClick={pickAndUpload}
			type="button"
		>
			Upload file
		</button>
	);
};

export { FileUploader };
