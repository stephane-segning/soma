import { motion } from "motion/react";
import { Zap } from "react-feather";
import { cn } from "../../utils/cn";

export type StreakMeterProps = {
	value: number;
	max?: number;
	label?: string;
};

export function StreakMeter({
	value,
	max = 7,
	label = "Streak",
}: StreakMeterProps) {
	const clamped = Math.min(max, Math.max(0, value));
	const pct = Math.round((clamped / max) * 100);
	return (
		<div className="rounded-2xl border border-base-300/60 bg-base-100/80 p-4 shadow">
			<div className="flex items-center justify-between font-semibold text-sm">
				<span className="flex items-center gap-2">
					<Zap className="text-warning" size={16} />
					{label}
				</span>
				<span className="text-base-content/70">
					{clamped}/{max}
				</span>
			</div>
			<div className="mt-3 h-2 rounded-full bg-base-200">
				<motion.div
					animate={{ width: `${pct}%` }}
					className="h-2 rounded-full bg-gradient-to-r from-warning to-error"
					initial={false}
				/>
			</div>
		</div>
	);
}

export type XpMeterProps = {
	value: number;
	max: number;
	label?: string;
};

export function XpMeter({ value, max, label = "XP" }: XpMeterProps) {
	const pct = Math.min(100, Math.round((value / max) * 100));
	return (
		<div className="rounded-2xl border border-base-300/60 bg-base-100/80 p-4 shadow">
			<div className="flex items-center justify-between font-semibold text-sm">
				<span className="flex items-center gap-2">
					<Zap className="text-primary" size={16} />
					{label}
				</span>
				<span className="text-base-content/70">
					{value} / {max}
				</span>
			</div>
			<div className="mt-3 h-2 rounded-full bg-base-200">
				<motion.div
					animate={{ width: `${pct}%` }}
					className="h-2 rounded-full bg-gradient-to-r from-primary to-secondary"
					initial={false}
				/>
			</div>
		</div>
	);
}

export type TimerPillProps = {
	label?: string;
	timecode: string;
	accent?: "primary" | "success" | "warning" | "danger";
	className?: string;
};

const timerAccent = {
	primary: "text-primary bg-primary/15 border-primary/30",
	success: "text-success bg-success/15 border-success/30",
	warning: "text-warning bg-warning/15 border-warning/30",
	danger: "text-error bg-error/15 border-error/30",
};

export function TimerPill({
	label = "Timer",
	timecode,
	accent = "primary",
	className,
}: TimerPillProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-full border px-3 py-1 font-semibold text-sm",
				timerAccent[accent],
				className,
			)}
		>
			<span>{label}</span>
			<span className="rounded bg-base-100/60 px-2 py-0.5 text-xs">
				{timecode}
			</span>
		</div>
	);
}
