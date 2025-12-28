import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type AiChatProps = {
	children: ReactNode;
	footer?: ReactNode;
	maxHeight?: number | string;
	className?: string;
	contentClassName?: string;
};

export function AiChat({ children, footer, maxHeight = "70vh", className, contentClassName }: AiChatProps) {
	return (
		<div
			className={cn("flex flex-col rounded-2xl border border-base-300/60 bg-base-100/70 shadow-inner", className)}
			style={{ maxHeight }}
		>
			<div className={cn("flex-1 overflow-auto p-4", contentClassName)}>{children}</div>
			{footer ? <div className="border-t border-base-300/60 bg-base-100/80 p-3">{footer}</div> : null}
		</div>
	);
}
