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
			className="w-full user-select-none m-[20px_0_10px] relative flex"
			{...attributes}
			contentEditable={false}
		>
			<button
				className="yoopta-button p-[12px_36px_12px_12px] flex items-center text-left w-full overflow-hidden rounded-[3px] text-[14px] text-[rgba(55,53,47,0.65)] relative cursor-pointer border-none bg-[#efefef] transition-[background-color_100ms_ease-in] hover:bg-[#e3e3e3]"
				disabled={loading}
				onClick={() => setIsUploaderOpen(true)}
				ref={refs.setReference}
				type="button"
			>
				{loading ? (
					<Loader
						className="mr-2 user-select-none"
						height={24}
						width={24}
					/>
				) : (
					<VideoIcon
						className="mr-2 user-select-none"
						height={24}
						width={24}
					/>
				)}
				<span className="font-medium">
					{loading ? "Loading..." : "Click to add video"}
				</span>
				{loading && (
					<div
						className="absolute top-0 left-0 h-full bg-[rgba(55,53,47,0.16)]"
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
