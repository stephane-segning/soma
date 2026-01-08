import type {
	HTMLAttributes,
	IframeHTMLAttributes,
	ReactNode,
	RefCallback,
} from "react";
import { useRef, useState } from "react";

import { useIntersectionObserver } from "../hooks/useIntersectionObserver";

type Props = {
	videoId: string;
	children?: ReactNode;
	attributes: HTMLAttributes<HTMLDivElement> & { ref: RefCallback<HTMLDivElement> };
} & IframeHTMLAttributes<HTMLIFrameElement>;

const YouTubePlayer = ({ videoId, children, attributes, ...other }: Props) => {
	const youtubeRootRef = useRef<HTMLDivElement | null>(null);
	const [isFrameLoaded, setFrameLoaded] = useState(false);

	const { isIntersecting: isInViewport } = useIntersectionObserver(
		youtubeRootRef,
		{
			freezeOnceVisible: true,
			rootMargin: "50%",
		},
	);

	const onRef = (el: HTMLDivElement | null) => {
		youtubeRootRef.current = el;
		attributes.ref(el);
	};

	return (
		<div {...attributes} className="relative" ref={onRef}>
			<img
				alt="youtube_video_preview"
				className="absolute top-0 left-0 w-full h-full"
				height="100%"
				src={`https://i.ytimg.com/vi/${videoId}/default.jpg`}
				style={{
					opacity: isInViewport && isFrameLoaded ? 0 : 1,
					zIndex: isInViewport && isFrameLoaded ? -1 : 0,
				}}
				width="100%"
			/>
			{isInViewport && (
				<iframe
					allowFullScreen
					// https://developers.google.com/youtube/player_parameters?hl=en
					className="absolute top-0 left-0"
					frameBorder={0}
					onLoad={() => setFrameLoaded(true)}
					src={`https://www.youtube.com/embed/${videoId}`}
					title="Video Player"
					{...other}
				/>
			)}
			{children}
		</div>
	);
};

export default YouTubePlayer;
