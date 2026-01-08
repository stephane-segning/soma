// @ts-nocheck

import {
	ExternalLinkIcon,
	ImageIcon,
	RowSpacingIcon,
	SizeIcon,
	TextAlignCenterIcon,
	TextAlignLeftIcon,
	TextAlignRightIcon,
	UpdateIcon,
	WidthIcon,
} from "@radix-ui/react-icons";
import type { YooEditor, YooptaBlockData } from "@yoopta/editor";
import { Blocks, Elements, UI, useYooptaPluginOptions } from "@yoopta/editor";
import { useState } from "react";
import CheckmarkIcon from "../icons/checkmark.svg";
import DownloadIcon from "../icons/download.svg";
import type {
	VideoElementProps,
	VideoPluginElements,
	VideoPluginOptions,
} from "../types";
import { Loader } from "./Loader";

const ALIGN_ICONS = {
	left: TextAlignLeftIcon,
	center: TextAlignCenterIcon,
	right: TextAlignRightIcon,
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
	props?: VideoElementProps;
	settings?: VideoElementProps["settings"];
};

type Loaders = "poster" | "video";
const DEFAULT_LOADER_STATE: Record<Loaders, boolean> = {
	poster: false,
	video: false,
};

const VideoBlockOptions = ({ editor, block, props: videoProps }: Props) => {
	const options = useYooptaPluginOptions<VideoPluginOptions>("Video");
	const [loaders, setLoaders] =
		useState<Record<Loaders, boolean>>(DEFAULT_LOADER_STATE);
	const onSetLoading = (type: Loaders, state: boolean) =>
		setLoaders((prev) => ({ ...prev, [type]: state }));

	const onCover = () => {
		Elements.updateElement<VideoPluginElements, VideoElementProps>(
			editor,
			block.id,
			{
				type: "video",
				props: { fit: "cover" },
			},
		);
	};

	const onFit = () => {
		Elements.updateElement<VideoPluginElements, VideoElementProps>(
			editor,
			block.id,
			{
				type: "video",
				props: { fit: "contain" },
			},
		);
	};

	const onFill = () => {
		Elements.updateElement<VideoPluginElements, VideoElementProps>(
			editor,
			block.id,
			{
				type: "video",
				props: { fit: "fill" },
			},
		);
	};

	const isExternalVideo = !!videoProps?.provider?.id;

	const onDownload = () => {
		if (!videoProps || !videoProps.src || isExternalVideo) return;

		const link = document.createElement("a");
		link.href = videoProps.src;
		link.download = videoProps.src;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const onOpen = () => {
		if (videoProps?.provider?.url) {
			window.open(videoProps?.provider?.url, "_blank");
		}
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

	const onUploadPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!options?.onUploadPoster) {
			throw new Error(
				"onUploadPoster not provided in plugin options. Check Video.extend({}) method",
			);
		}

		const file = e.target.files?.[0];
		if (!file) return;

		onSetLoading("poster", true);

		const posterSrc = await options.onUploadPoster?.(file);
		Elements.updateElement<VideoPluginElements, VideoElementProps>(
			editor,
			block.id,
			{
				type: "video",
				props: { poster: posterSrc },
			},
		);

		onSetLoading("poster", false);
	};

	const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!options?.onUpload) {
			throw new Error(
				"onUpload not provided in plugin options. Check Video.extend({}) method",
			);
		}

		const file = e.target.files?.[0];
		if (!file) return;

		onSetLoading("video", true);

		// [TODO] - abort controller?
		const data = await options?.onUpload(file);
		const defaultVideoProps = editor.plugins.Video.elements.video
			.props as VideoElementProps;

		Elements.updateElement<VideoPluginElements, VideoElementProps>(
			editor,
			block.id,
			{
				type: "video",
				props: {
					src: data.src,
					sizes: data.sizes || defaultVideoProps.sizes,
					bgColor: data.bgColor || defaultVideoProps.bgColor,
					fit: videoProps?.fit || data.fit || defaultVideoProps.fit || "cover",
					settings:
						videoProps?.settings || data.settings || defaultVideoProps.settings,
				},
			},
		);

		onSetLoading("video", false);
	};

	return (
		<ExtendedBlockActions
			id="yoopta-video-options"
			onClick={() => editor.setPath({ current: block.meta.order })}
		>
			<BlockOptionsSeparator />
			{!isExternalVideo && (
				<>
					<BlockOptionsMenuGroup>
						<BlockOptionsMenuItem>
							<button
								className="yoopta-block-options-button justify-between"
								onClick={onFit}
								type="button"
							>
								<span className="flex">
									<RowSpacingIcon
										className="mr-2 h-4 w-4"
										height={16}
										width={16}
									/>
									Fit
								</span>
								{videoProps?.fit === "contain" && (
									<CheckmarkIcon className="h-4 w-4" height={16} width={16} />
								)}
							</button>
						</BlockOptionsMenuItem>
						<BlockOptionsMenuItem>
							<button
								className="yoopta-block-options-button justify-between"
								onClick={onFill}
								type="button"
							>
								<span className="flex">
									<WidthIcon className="mr-2 h-4 w-4" height={16} width={16} />
									Fill
								</span>
								{videoProps?.fit === "fill" && (
									<CheckmarkIcon className="h-4 w-4" height={16} width={16} />
								)}
							</button>
						</BlockOptionsMenuItem>
						<BlockOptionsMenuItem>
							<button
								className="yoopta-block-options-button justify-between"
								onClick={onCover}
								type="button"
							>
								<span className="flex">
									<SizeIcon className="mr-2 h-4 w-4" height={16} width={16} />
									Cover
								</span>
								{videoProps?.fit === "cover" && (
									<CheckmarkIcon className="h-4 w-4" height={16} width={16} />
								)}
							</button>
						</BlockOptionsMenuItem>
					</BlockOptionsMenuGroup>
					<BlockOptionsSeparator />
				</>
			)}
			{!isExternalVideo && (
				<>
					<BlockOptionsMenuGroup>
						<BlockOptionsMenuItem>
							<label
								className="relative mx-[4px] flex w-full cursor-pointer justify-start rounded-sm px-2 py-1.5 leading-[120%] hover:bg-[#37352f14] data-[disabled=true]:pointer-events-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
								data-disabled={loaders.video}
								htmlFor="video-uploader"
							>
								<input
									accept={options.accept}
									className="absolute hidden"
									disabled={loaders.video}
									id="video-uploader"
									multiple={false}
									onChange={onUpload}
									type="file"
								/>
								{loaders.video ? (
									<Loader
										className="user-select-none mr-2"
										height={24}
										width={24}
									/>
								) : (
									<UpdateIcon className="mr-2 h-4 w-4" height={16} width={16} />
								)}
								Replace video
							</label>
						</BlockOptionsMenuItem>
					</BlockOptionsMenuGroup>
					<BlockOptionsSeparator />
				</>
			)}
			<BlockOptionsMenuGroup>
				{options.onUploadPoster && !isExternalVideo && (
					<BlockOptionsMenuItem>
						<label
							className="relative mx-[4px] flex w-full cursor-pointer justify-start rounded-sm px-2 py-1.5 leading-[120%] hover:bg-[#37352f14] data-[disabled=true]:pointer-events-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
							data-disabled={loaders.poster}
							htmlFor="video-poster-uploader"
						>
							<input
								accept="image/*"
								className="absolute hidden"
								disabled={loaders.poster}
								id="video-poster-uploader"
								multiple={false}
								onChange={onUploadPoster}
								type="file"
							/>
							{loaders.poster ? (
								<Loader
									className="user-select-none mr-2"
									height={24}
									width={24}
								/>
							) : (
								<ImageIcon className="mr-2 h-4 w-4" height={16} width={16} />
							)}
							{videoProps?.poster ? "Replace poster" : "Add poster"}
						</label>
					</BlockOptionsMenuItem>
				)}
				<BlockOptionsMenuItem>
					<button
						className="yoopta-button mx-[4px] flex w-full cursor-pointer justify-start rounded-sm px-2 py-1.5 leading-[120%] hover:bg-[#37352f14]"
						onClick={onToggleAlign}
						type="button"
					>
						<AlignIcon className="mr-2 h-4 w-4" height={16} width={16} />
						Alignment
					</button>
				</BlockOptionsMenuItem>
				<BlockOptionsMenuItem>
					<button
						className="yoopta-button mx-[4px] flex w-full cursor-pointer justify-start rounded-sm px-2 py-1.5 leading-[120%] hover:bg-[#37352f14]"
						onClick={isExternalVideo ? onOpen : onDownload}
						type="button"
					>
						{isExternalVideo ? (
							<>
								<ExternalLinkIcon
									className="mr-2 h-4 w-4"
									height={16}
									width={16}
								/>
								Open
							</>
						) : (
							<>
								<DownloadIcon className="mr-2 h-4 w-4" height={16} width={16} />
								Download
							</>
						)}
					</button>
				</BlockOptionsMenuItem>
			</BlockOptionsMenuGroup>
		</ExtendedBlockActions>
	);
};

export { VideoBlockOptions };
