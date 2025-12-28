import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type Status = "online" | "syncing" | "offline";

export type WindowChromeProps = {
	title: string;
	subtitle?: string;
	status?: Status;
	actions?: ReactNode;
	onMinimize?: () => void;
	onMaximize?: () => void;
	onClose?: () => void;
	className?: string;
};

const statusTone: Record<Status, string> = {
	online: "bg-success",
	syncing: "bg-warning",
	offline: "bg-error",
};

export function WindowChrome({
	title,
	subtitle,
	status = "online",
	actions,
	onMinimize,
	onMaximize,
	onClose,
	className,
}: WindowChromeProps) {
	return (
		<div
			className={cn(
				"glass-panel relative flex items-center justify-between rounded-t-2xl px-4 py-2 text-sm",
				"[data-tauri-drag-region]",
				className,
			)}
		>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1.5">
					<span
						className={cn("h-2.5 w-2.5 rounded-full", statusTone[status])}
					/>
					<span className="text-xs text-base-content/70 capitalize">
						{status}
					</span>
				</div>
				<div className="h-6 w-px bg-base-300/70" />
				<div className="flex flex-col leading-tight">
					<span className="text-sm font-semibold">{title}</span>
					{subtitle ? (
						<span className="text-xs text-base-content/60">{subtitle}</span>
					) : null}
				</div>
			</div>

			<div className="flex items-center gap-2" data-no-drag>
				{actions}
				<ChromeButton label="Minimize" tone="muted" onClick={onMinimize} />
				<ChromeButton label="Maximize" tone="muted" onClick={onMaximize} />
				<ChromeButton label="Close" tone="danger" onClick={onClose} />
			</div>
		</div>
	);
}

function ChromeButton({
	label,
	onClick,
	tone = "muted",
}: {
	label: string;
	onClick?: () => void;
	tone?: "muted" | "danger";
}) {
	const color = tone === "danger" ? "bg-error" : "bg-base-300";
	return (
		<motion.button
			whileHover={{ scale: 1.05 }}
			whileTap={{ scale: 0.94 }}
			onClick={onClick}
			type="button"
			className={cn("grid h-3 w-3 place-items-center rounded-full", color)}
			aria-label={label}
		/>
	);
}
