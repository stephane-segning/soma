import { motion } from "motion/react";
import type { ReactNode } from "react";
import { MoreVertical } from "react-feather";
import { PolymorphButton } from "../actions/polymorph-button";
import { StatusBadge } from "../presence/status-badge";

export type RosterItemProps = {
	id: string;
	title: string;
	subtitle?: string;
	role?: string;
	status?: "pending" | "approved" | "rejected";
	actions?: ReactNode;
	onMore?: () => void;
	avatar?: ReactNode;
};

const statusTone = {
	pending: { label: "Pending", tone: "warning" as const },
	approved: { label: "Member", tone: "success" as const },
	rejected: { label: "Rejected", tone: "danger" as const },
};

export function RosterItem({
	title,
	subtitle,
	role,
	status = "pending",
	actions,
	onMore,
	avatar,
}: RosterItemProps) {
	const badge = statusTone[status];
	return (
		<motion.div
			className="flex items-center gap-3 rounded-xl border border-base-300/60 bg-base-100/80 px-3 py-2 shadow-sm"
			layout
		>
			<div className="grid h-10 w-10 place-items-center rounded-xl bg-base-200 font-semibold text-base-content/80 text-sm">
				{avatar ?? title.slice(0, 2).toUpperCase()}
			</div>
			<div className="flex-1 leading-tight">
				<div className="flex items-center gap-2">
					<div className="font-semibold text-sm">{title}</div>
					{role ? <StatusBadge label={role} tone="info" /> : null}
				</div>
				{subtitle ? (
					<div className="text-base-content/60 text-xs">{subtitle}</div>
				) : null}
			</div>
			{badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}
			{actions}
			{onMore ? (
				<PolymorphButton
					aria-label="More options"
					iconOnly
					leadingIcon={<MoreVertical size={14} />}
					onClick={onMore}
					size="xs"
					variant="ghost"
				/>
			) : null}
		</motion.div>
	);
}
