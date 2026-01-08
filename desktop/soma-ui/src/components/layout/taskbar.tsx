import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Grid, Maximize2, Power, Square } from "react-feather";
import type { RunningApp } from "../../types";
import { cn } from "../../utils/cn";
import { PolymorphButton } from "../actions/polymorph-button";

export type TaskbarProps = {
	apps: RunningApp[];
	activeAppId?: string;
	startOpen?: boolean;
	onStart?: () => void;
	onSelectApp?: (appId: string) => void;
	onCloseApp?: (appId: string) => void;
	tray?: ReactNode;
	className?: string;
};

export function Taskbar({
	apps,
	activeAppId,
	startOpen,
	onStart,
	onSelectApp,
	onCloseApp,
	tray,
	className,
}: TaskbarProps) {
	return (
		<div
			className={cn(
				"glass-panel mx-auto mt-2 mb-4 flex w-full max-w-6xl items-center gap-2 rounded-2xl px-3 py-2",
				className,
			)}
		>
			<PolymorphButton
				className={cn(
					startOpen &&
						"ring-2 ring-primary/50 ring-offset-2 ring-offset-base-200",
				)}
				leadingIcon={<Grid size={14} />}
				onClick={onStart}
				size="sm"
				variant="primary"
			>
				Start
			</PolymorphButton>

			<div className="flex flex-1 items-center gap-2 overflow-auto px-2">
				{apps.map((app) => {
					const isActive = app.id === activeAppId;
					return (
						<motion.button
							className={cn(
								"relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
								isActive ? "bg-base-200" : "hover:bg-base-200",
							)}
							key={app.id}
							layout
							onClick={() => onSelectApp?.(app.id)}
							type="button"
						>
							<span className="grid h-8 w-8 place-items-center rounded-lg bg-base-300/60 text-base-content/80">
								{app.icon ?? <Square size={14} />}
							</span>
							<div className="min-w-[120px] text-left">
								<div className="line-clamp-1 font-medium text-sm">
									{app.title}
								</div>
								<div className="text-base-content/60 text-xs">
									{app.status === "sleeping"
										? "Sleeping"
										: app.status === "attention"
											? "Attention"
											: "Running"}
								</div>
							</div>
							{app.badge ? (
								<span className="badge badge-sm badge-primary border-none">
									{app.badge}
								</span>
							) : null}
							<div className="absolute inset-x-2 -bottom-1">
								<motion.div
									className={cn(
										"h-0.5 rounded-full",
										isActive ? "bg-primary" : "bg-base-content/30",
									)}
									layoutId="taskbar-indicator"
								/>
							</div>
							{app.onClose ? (
								<PolymorphButton
									aria-label={`Close ${app.title}`}
									className="ml-2"
									iconOnly
									leadingIcon={<Power size={14} />}
									onClick={(event) => {
										event.stopPropagation();
										app.onClose?.();
										onCloseApp?.(app.id);
									}}
									size="xs"
									variant="ghost"
								/>
							) : null}
						</motion.button>
					);
				})}
			</div>

			<div className="flex items-center gap-3">
				{tray}
				<PolymorphButton
					leadingIcon={<Maximize2 size={14} />}
					size="sm"
					variant="ghost"
				>
					Show desktop
				</PolymorphButton>
			</div>
		</div>
	);
}
