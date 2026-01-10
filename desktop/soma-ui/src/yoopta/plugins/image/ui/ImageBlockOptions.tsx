import { flip, inline, offset, shift, useFloating } from "@floating-ui/react";
import type { YooEditor, YooptaBlockData } from "@yoopta/editor";
import { Blocks, Elements, UI, useYooptaPluginOptions } from "@yoopta/editor";
import { useState } from "react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Check,
	Crop,
	Download,
	Maximize2,
	Minimize2,
	RefreshCw,
	Type,
} from "react-feather";
import type {
	ImageElementProps,
	ImagePluginElements,
	ImagePluginOptions,
} from "../types";
import { InputAltText } from "./InputAltText";
import { Loader } from "./Loader";

const ALIGN_ICONS = {
	left: AlignLeft,
	center: AlignCenter,
	right: AlignRight,
};

const {
	ExtendedBlockActions,
	BlockOptionsMenuGroup,
	BlockOptionsMenuItem,
	BlockOptionsSeparator,
} = UI;

type Props = {
	editor: YooEditor;
	block: YooptaBlockData;
	props?: ImageElementProps;
};

const ImageBlockOptions = ({ editor, block, props: imageProps }: Props) => {
	const options = useYooptaPluginOptions<ImagePluginOptions>("Image");
	const [isAltTextOpen, setIsAltTextOpen] = useState(false);
	const [loading, setLoading] = useState<boolean>(false);
	const [altText, setAltText] = useState<string>(imageProps?.alt || "");

	const { refs, floatingStyles } = useFloating({
		placement: "left",
		open: isAltTextOpen,
		onOpenChange: setIsAltTextOpen,
		middleware: [inline(), flip(), shift(), offset(10)],
	});

	const onSetLoading = (slate: boolean) => setLoading(slate);

	const onSetAltText = (text: string) => setAltText(text);
	const onSaveAltText = () => {
		if (!altText) return;
		Elements.updateElement<ImagePluginElements, ImageElementProps>(
			editor,
			block.id,
			{
				type: "image",
				props: { alt: altText },
			},
		);

		setIsAltTextOpen(false);
	};

	const onDeleteAltText = () => {
		setAltText("");
		Elements.updateElement<ImagePluginElements, ImageElementProps>(
			editor,
			block.id,
			{
				type: "image",
				props: { alt: "" },
			},
		);

		setIsAltTextOpen(false);
	};

	const onCover = () => {
		Elements.updateElement<ImagePluginElements, ImageElementProps>(
			editor,
			block.id,
			{
				type: "image",
				props: { fit: "cover" },
			},
		);
	};

	const onFit = () => {
		Elements.updateElement<ImagePluginElements, ImageElementProps>(
			editor,
			block.id,
			{
				type: "image",
				props: { fit: "contain" },
			},
		);
	};

	const onFill = () => {
		Elements.updateElement<ImagePluginElements, ImageElementProps>(
			editor,
			block.id,
			{
				type: "image",
				props: { fit: "fill" },
			},
		);
	};

	const onDownload = () => {
		if (!imageProps || !imageProps.src) return;

		const link = document.createElement("a");
		link.href = imageProps.src;
		link.download = imageProps.alt || imageProps.src;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const currentAlign = block?.meta?.align || "center";
	const AlignIcon = ALIGN_ICONS[currentAlign];

	const onToggleAlign = () => {
		const aligns = ["left", "center", "right"];
		if (!block) return;

		const nextAlign = aligns[
			(aligns.indexOf(currentAlign) + 1) % aligns.length
		] as YooptaBlockData["meta"]["align"];
		Blocks.updateBlock(editor, block.id, {
			meta: { ...block.meta, align: nextAlign },
		});
	};

	const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!options?.onUpload) {
			throw new Error(
				"onUpload not provided in plugin options. Check Image.extend({}) method",
			);
		}

		const file = e.target.files?.[0];
		if (!file) return;

		onSetLoading(true);

		try {
			const data = await options?.onUpload(file);
			const defaultImageProps = editor.plugins.Image.elements.image
				.props as ImageElementProps;

			Elements.updateElement<ImagePluginElements, ImageElementProps>(
				editor,
				block.id,
				{
					type: "image",
					props: {
						src: data.src,
						alt: data.alt,
						sizes: data.sizes || defaultImageProps.sizes,
						bgColor:
							imageProps?.bgColor || data.bgColor || defaultImageProps.bgColor,
						fit: imageProps?.fit || data.fit || defaultImageProps.fit || "fill",
					},
				},
			);
		} catch (error) {
		} finally {
			onSetLoading(false);
		}
	};

	return (
		<ExtendedBlockActions
			className="yoopta-image-options"
			onClick={() => editor.setPath({ current: block.meta.order })}
		>
			<BlockOptionsSeparator />
			<BlockOptionsMenuGroup>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-block-options-button justify-between"
						onClick={onFit}
						type="button"
					>
						<span className="flex">
							<Minimize2 className="mr-2 size-4" />
							Fit
						</span>
						{imageProps?.fit === "contain" && <Check className="size-4" />}
					</button>
				</BlockOptionsMenuItem>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-block-options-button justify-between"
						onClick={onFill}
						type="button"
					>
						<span className="flex">
							<Maximize2 className="mr-2 size-4" />
							Fill
						</span>
						{imageProps?.fit === "fill" && <Check className="size-4" />}
					</button>
				</BlockOptionsMenuItem>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-block-options-button justify-between"
						onClick={onCover}
						type="button"
					>
						<span className="flex">
							<Crop className="mr-2 size-4" />
							Cover
						</span>
						{imageProps?.fit === "cover" && <Check className="size-4" />}
					</button>
				</BlockOptionsMenuItem>
			</BlockOptionsMenuGroup>
			<BlockOptionsSeparator />
			<BlockOptionsMenuGroup>
				{isAltTextOpen && (
					<InputAltText
						floatingStyles={floatingStyles}
						onChange={onSetAltText}
						onClose={() => setIsAltTextOpen(false)}
						onDelete={onDeleteAltText}
						onSave={onSaveAltText}
						refs={refs}
						value={altText}
					/>
				)}
				<BlockOptionsMenuItem>
					<button
						className="yoopta-block-options-button"
						onClick={() => setIsAltTextOpen(true)}
						ref={refs.setReference}
						type="button"
					>
						<Type className="mr-2 size-4" />
						Alt text
					</button>
				</BlockOptionsMenuItem>
				<BlockOptionsMenuItem>
					<label
						className="relative mx-1 flex w-full cursor-pointer justify-start rounded-sm px-2 py-1.5 leading-[120%] hover:bg-[#37352f14] data-[disabled=true]:pointer-events-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
						data-disabled={loading}
						htmlFor="image-uploader"
					>
						<input
							accept={options.accept}
							className="absolute hidden"
							disabled={loading}
							id="image-uploader"
							multiple={false}
							onChange={onUpload}
							type="file"
						/>
						{loading ? (
							<Loader
								className="user-select-none mr-2"
								height={24}
								width={24}
							/>
						) : (
							<RefreshCw className="mr-2 size-4" />
						)}
						Replace image
					</label>
				</BlockOptionsMenuItem>
			</BlockOptionsMenuGroup>
			<BlockOptionsSeparator />
			<BlockOptionsMenuGroup>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-button mx-1 flex w-full cursor-pointer justify-start rounded-sm px-2 py-1.5 leading-[120%] hover:bg-[#37352f14]"
						onClick={onToggleAlign}
						type="button"
					>
						<AlignIcon className="mr-2 size-4" />
						Alignment
					</button>
				</BlockOptionsMenuItem>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-block-options-button"
						onClick={onDownload}
						type="button"
					>
						<Download className="size-4" />
						Download
					</button>
				</BlockOptionsMenuItem>
			</BlockOptionsMenuGroup>
		</ExtendedBlockActions>
	);
};

export { ImageBlockOptions };
