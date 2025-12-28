import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type PresenceAvatar = {
	id: string;
	label: string;
	color?: string;
	indicator?: "online" | "away" | "offline";
	element?: ReactNode;
};

export type PresenceStackProps = {
	avatars: PresenceAvatar[];
	limit?: number;
	className?: string;
};

const indicatorTone = {
	online: "bg-success",
	away: "bg-warning",
	offline: "bg-base-400",
};

export function PresenceStack({
	avatars,
	limit = 5,
	className,
}: PresenceStackProps) {
	const visible = avatars.slice(0, limit);
	const remaining = avatars.length - visible.length;

	return (
		<div className={cn("flex items-center -space-x-2", className)}>
			{visible.map((avatar) => (
				<div
					className="relative h-9 w-9 rounded-full border-2 border-base-100 bg-base-200 font-semibold text-base-content/80 text-xs shadow-sm"
					key={avatar.id}
				>
					{avatar.element ? (
						avatar.element
					) : (
						<div
							className="flex h-full w-full items-center justify-center rounded-full"
							style={{
								backgroundColor: avatar.color ?? "var(--fallback-b1, #e5e7eb)",
							}}
						>
							{avatar.label.slice(0, 2).toUpperCase()}
						</div>
					)}
					{avatar.indicator ? (
						<span
							className={cn(
								"absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-base-100",
								indicatorTone[avatar.indicator],
							)}
						/>
					) : null}
				</div>
			))}
			{remaining > 0 ? (
				<div className="grid h-9 w-9 place-items-center rounded-full border-2 border-base-100 bg-base-200 font-semibold text-base-content/70 text-xs shadow-sm">
					+{remaining}
				</div>
			) : null}
		</div>
	);
}
