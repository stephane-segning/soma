import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type StatusBadgeProps = {
	label: string;
	tone?: "info" | "success" | "warning" | "danger" | "muted";
	icon?: ReactNode;
	className?: string;
};

const toneStyles = {
	info: "bg-primary/15 text-primary border-primary/30",
	success: "bg-success/15 text-success border-success/30",
	warning: "bg-warning/15 text-warning border-warning/30",
	danger: "bg-error/15 text-error border-error/30",
	muted: "bg-base-200 text-base-content/70 border-base-300",
};

export function StatusBadge({
	label,
	tone = "info",
	icon,
	className,
}: StatusBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
				toneStyles[tone],
				className,
			)}
		>
			{icon}
			{label}
		</span>
	);
}
