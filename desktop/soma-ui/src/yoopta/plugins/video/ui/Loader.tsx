import type { ReactNode } from "react";

type Props = {
	className?: string;
	children?: ReactNode;
	width?: number;
	height?: number;
};

const Loader = ({ className, width, height, children }: Props) => (
	<div className={className}>
		{children}
		<svg
			className="lucide lucide-loader-2 yoo-video-h-4 yoo-video-w-4 yoo-video-animate-spin"
			fill="none"
			height={height}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			viewBox="0 0 24 24"
			width={width}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M21 12a9 9 0 1 1-6.219-8.56" />
		</svg>
	</div>
);

export { Loader };
