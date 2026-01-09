import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type AiChatProps = {
	children: ReactNode;
	maxHeight?: number | string;
	className?: string;
	contentClassName?: string;
};

export function AiChat({
	children,
	maxHeight = "70vh",
	className,
	contentClassName,
}: AiChatProps) {
	return (
		<div className={cn("flex flex-col", className)} style={{ maxHeight }}>
			<div className={cn("flex-1 overflow-auto p-2", contentClassName)}>
				{children}
			</div>
		</div>
	);
}
