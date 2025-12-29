import { flip, inline, offset, shift, useFloating } from "@floating-ui/react";
import { VideoIcon } from "@radix-ui/react-icons";
import type { CSSProperties, HTMLAttributes, ReactNode, RefCallback } from "react";
import { useState } from "react";

import { Loader } from "./Loader";
import { VideoUploader } from "./VideoUploader";

const loadingStyles: CSSProperties = {
	width: "100%",
	transition: "width 100ms ease-in",
};

type PlaceholderProps = {
	attributes: HTMLAttributes<HTMLDivElement> & { ref: RefCallback<HTMLDivElement> };
	children?: ReactNode;
	blockId: string;
};

const Placeholder = ({ attributes, children, blockId }: PlaceholderProps) => {
	const [isUploaderOpen, setIsUploaderOpen] = useState(false);
	const [loading, setLoading] = useState<boolean>(false);

	const { refs, floatingStyles } = useFloating({
		placement: "bottom",
		open: isUploaderOpen,
		onOpenChange: setIsUploaderOpen,
		middleware: [inline(), flip(), shift(), offset(10)],
	});

	const onSetLoading = (state: boolean) => setLoading(state);

	return (
		<div
			className="yoo-video-w-full yoo-video-user-select-none yoo-video-m-[20px_0_10px] yoo-video-relative yoo-video-flex"
			{...attributes}
			contentEditable={false}
		>
			<button
				className="yoopta-button yoo-video-p-[12px_36px_12px_12px] yoo-video-flex yoo-video-items-center yoo-video-text-left yoo-video-w-full yoo-video-overflow-hidden yoo-video-rounded-[3px] yoo-video-text-[14px] yoo-video-text-[rgba(55,53,47,0.65)] yoo-video-relative yoo-video-cursor-pointer yoo-video-border-none yoo-video-bg-[#efefef] yoo-video-transition-[background-color_100ms_ease-in] hover:yoo-video-bg-[#e3e3e3]"
				disabled={loading}
				onClick={() => setIsUploaderOpen(true)}
				ref={refs.setReference}
				type="button"
			>
				{loading ? (
					<Loader
						className="yoo-video-mr-2 yoo-video-user-select-none"
						height={24}
						width={24}
					/>
				) : (
					<VideoIcon
						className="yoo-video-mr-2 yoo-video-user-select-none"
						height={24}
						width={24}
					/>
				)}
				<span className="yoo-video-font-medium">
					{loading ? "Loading..." : "Click to add video"}
				</span>
				{loading && (
					<div
						className="yoo-video-absolute yoo-video-top-0 yoo-video-left-0 yoo-video-h-full yoo-video-bg-[rgba(55,53,47,0.16)]"
						style={loadingStyles}
					/>
				)}
			</button>
			{isUploaderOpen && (
				<VideoUploader
					blockId={blockId}
					floatingStyles={floatingStyles}
					onClose={() => setIsUploaderOpen(false)}
					onSetLoading={onSetLoading}
					refs={refs}
				/>
			)}
			{children}
		</div>
	);
};

export { Placeholder };
