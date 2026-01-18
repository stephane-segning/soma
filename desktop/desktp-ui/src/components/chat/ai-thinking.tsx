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
				"rounded-xl bg-base-200/60 px-2 py-1 text-base-content/80 text-sm",
				className,
			)}
		>
			<button
				className="flex w-full cursor-pointer items-center gap-2 text-left"
				onClick={() => setOpen((state) => !state)}
				type="button"
			>
				{status === "thinking" ? (
					<motion.div
						animate={{ rotate: 360 }}
						className="text-base-content/60"
						transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
					>
						<Activity size={16} />
					</motion.div>
				) : (
					<Aperture className="text-base-content/60" size={16} />
				)}
				<span className="flex-1 font-medium">{label}</span>
				{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
			</button>

			<AnimatePresence initial={false}>
				{showContent ? (
					<motion.div
						animate={{ opacity: 1, height: "auto" }}
						className="mt-2 overflow-hidden text-base-content"
						exit={{ opacity: 0, height: 0 }}
						initial={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.15 }}
					>
						<AiMarkdown
							className="prose prose-sm prose-invert max-w-none"
							content={content ?? ""}
						/>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
