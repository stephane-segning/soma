// @ts-nocheck

import { Elements, useYooptaEditor } from "@yoopta/editor";
import type { ChangeEvent } from "react";
import { useState } from "react";

import type { VideoElementProps, VideoPluginElements } from "../types";
import { getProvider, ProviderGetters } from "../utils/providers";

const EmbedUploader = ({ blockId, onClose }) => {
	const editor = useYooptaEditor();
	const [value, setValue] = useState("");

	const onChange = (e: ChangeEvent<HTMLInputElement>) =>
		setValue(e.target.value);

	const embed = () => {
		if (value.length === 0) return;

		const providerType = getProvider(value);
		const videoId = providerType
			? ProviderGetters[providerType]?.(value)
			: null;

		if (!providerType || !videoId)
			return console.warn(
				"Unsupported video provider or video id is not found.",
			);

		Elements.updateElement<VideoPluginElements, VideoElementProps>(
			editor,
			blockId,
			{
				type: "video",
				props: {
					src: value,
					provider: { type: providerType, id: videoId, url: value },
				},
			},
		);

		onClose();
	};

	const isEmpty = value.length === 0;

	return (
		<div className="user-select-none white-space-nowrap w-full cursor-pointer transition-bg duration-20 ease-in">
			<input
				className="relative flex h-[32px] w-full cursor-text items-center rounded-[4px] border-none bg-[hsla(45,13%,94%,.6)] px-[6px] text-[14px] leading-[20px] shadow-[inset_0_0_0_1px_hsla(0,0%,6%,.1)]"
				onChange={onChange}
				placeholder="Paste video link"
				type="text"
				value={value}
			/>
			<button
				className="yoopta-button user-select-none white-space-nowrap m-[12px_0_6px] mx-auto flex h-[28px] w-full max-w-[300px] flex-shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-[rgb(35,131,226)] fill-white px-[12px] font-medium text-[14px] text-white leading-[1.2] shadow-[rgba(15,15,15,0.1)_0px_0px_0px_1px_inset,_rgba(15,15,15,0.1)_0px_1px_2px] transition-bg duration-20 ease-in disabled:cursor-not-allowed disabled:bg-[rgba(35,131,226,0.5)]"
				disabled={isEmpty}
				onClick={embed}
				type="button"
			>
				Embed video
			</button>
		</div>
	);
};

export { EmbedUploader };
