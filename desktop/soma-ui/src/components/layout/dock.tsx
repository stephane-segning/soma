import { motion } from "motion/react";
import type { RunningApp } from "../../types";
import { cn } from "../../utils/cn";

export type DockProps = {
	apps: RunningApp[];
	activeAppId?: string;
	onSelectApp?: (appId: string) => void;
	className?: string;
};

export function Dock({ apps, activeAppId, onSelectApp, className }: DockProps) {
	return (
		<div className={cn("glass-panel flex items-center gap-3 rounded-3xl px-3 py-2 shadow-2xl", className)}>
			{apps.map((app) => {
				const isActive = app.id === activeAppId;
				return (
					<motion.button
						key={app.id}
						whileHover={{ y: -4, scale: 1.02 }}
						whileTap={{ scale: 0.97 }}
						onClick={() => onSelectApp?.(app.id)}
						className="relative grid h-12 w-12 place-items-center rounded-2xl bg-base-200/70 text-base-content/90 shadow-inner"
						aria-label={app.title}
						type="button"
					>
						<span className="pointer-events-none text-xl">{app.icon}</span>
						{app.badge ? (
							<span className="badge badge-xs badge-primary absolute -top-1 -right-1 border-none">
								{app.badge}
							</span>
						) : null}
						<span
							className={cn(
								"absolute inset-x-4 -bottom-1 h-0.5 rounded-full transition-colors",
								isActive ? "bg-primary" : "bg-base-content/30",
							)}
						/>
					</motion.button>
				);
			})}
		</div>
	);
}
