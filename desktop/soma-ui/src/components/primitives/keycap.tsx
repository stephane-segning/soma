import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type KeycapProps = {
	children: ReactNode;
	className?: string;
};

export function Keycap({ children, className }: KeycapProps) {
	return (
		<span
			className={cn(
				"inline-flex min-w-6 items-center justify-center rounded-md border border-base-300/70 bg-base-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-base-content/70 shadow-sm",
				className,
			)}
		>
			{children}
		</span>
	);
}
