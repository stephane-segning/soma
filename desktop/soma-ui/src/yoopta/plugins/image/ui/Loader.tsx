import type { ReactNode } from "react";
import { Image } from "react-feather";

type Props = {
	className?: string;
	children?: ReactNode;
	width?: number;
	height?: number;
};

const Loader = ({ className, width, height, children }: Props) => (
	<div className={className}>
		{children}

		<Image height={height} width={width} />
	</div>
);

export { Loader };
