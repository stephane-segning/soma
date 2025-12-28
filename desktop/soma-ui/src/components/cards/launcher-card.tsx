import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ArrowRight } from "react-feather";
import { cn } from "../../utils/cn";

export type LauncherCardProps = {
	title: string;
	description?: string;
	icon?: ReactNode;
	badge?: string;
	actions?: ReactNode;
	onClick?: () => void;
	className?: string;
};

export function LauncherCard({ title, description, icon, badge, actions, onClick, className }: LauncherCardProps) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileHover={{ y: -2 }}
			whileTap={{ scale: 0.98 }}
			className={cn(
				"flex w-full items-start justify-between rounded-2xl border border-base-300/60 bg-base-100/80 p-4 text-left shadow hover:border-primary/50",
				className,
			)}
		>
			<div className="flex flex-1 items-start gap-3">
				<div className="grid h-12 w-12 place-items-center rounded-xl bg-base-200 text-base-content/80">
					{icon ?? <ArrowRight size={16} />}
				</div>
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<div className="text-base font-semibold">{title}</div>
						{badge ? <span className="badge badge-sm badge-primary border-none">{badge}</span> : null}
					</div>
					{description ? <p className="text-sm text-base-content/70">{description}</p> : null}
					{actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
				</div>
			</div>
			<ArrowRight size={16} className="text-base-content/50" />
		</motion.button>
	);
}
