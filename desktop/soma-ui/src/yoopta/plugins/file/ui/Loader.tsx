// @ts-nocheck
import type { ReactNode } from "react";
import { File } from "react-feather";

type Props = {
	className?: string;
	children?: ReactNode;
	width?: number;
	height?: number;
};

const Loader = ({ className, width, height, children }: Props) => (
	<div className={className}>
		{children}
		<File height={height} width={width} />
	</div>
);

export { Loader };
