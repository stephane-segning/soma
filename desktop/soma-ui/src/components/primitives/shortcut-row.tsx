import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Keycap } from "./keycap";

export type ShortcutRowProps = {
	label: string;
	keys: string[];
	icon?: ReactNode;
	className?: string;
};

export function ShortcutRow({
	label,
	keys,
	icon,
	className,
}: ShortcutRowProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-between rounded-xl bg-base-200/60 px-3 py-2 text-sm",
				className,
			)}
		>
			<div className="flex items-center gap-2 text-base-content/80">
				{icon ? <span className="text-base-content/70">{icon}</span> : null}
				<span>{label}</span>
			</div>
			<div className="flex items-center gap-1.5">
				{keys.map((key) => (
					<Keycap key={key}>{key}</Keycap>
				))}
			</div>
		</div>
	);
}
