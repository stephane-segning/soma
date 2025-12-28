import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Activity, Aperture, ChevronDown, ChevronUp } from "react-feather";
import { cn } from "../../utils/cn";
import { AiMarkdown } from "./ai-markdown";

export type AiThinkingProps = {
	status: "thinking" | "complete";
	durationLabel?: string;
	content?: string;
	defaultOpen?: boolean;
	className?: string;
};

export function AiThinking({
	status,
	durationLabel,
	content,
	defaultOpen = status === "thinking",
	className,
}: AiThinkingProps) {
	const [open, setOpen] = useState(defaultOpen);
	const showContent = Boolean(content) && open;
	const label =
		status === "thinking"
			? "Thinking..."
			: durationLabel
				? `Thought for ${durationLabel}`
				: "Thought complete";

	return (
		<div
			className={cn(
				"rounded-xl bg-base-200/60 px-3 py-2 text-sm text-base-content/80",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setOpen((state) => !state)}
				className="flex w-full items-center gap-2 text-left cursor-pointer"
			>
				{status === "thinking" ? (
					<motion.div
						animate={{ rotate: 360 }}
						transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
						className="text-base-content/60"
					>
						<Activity size={16} />
					</motion.div>
				) : (
					<Aperture size={16} className="text-base-content/60" />
				)}
				<span className="flex-1 font-medium">{label}</span>
				{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
			</button>

			<AnimatePresence initial={false}>
				{showContent ? (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.15 }}
						className="mt-2 overflow-hidden text-base-content"
					>
						<AiMarkdown
							content={content ?? ""}
							className="prose prose-sm prose-invert max-w-none"
						/>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
