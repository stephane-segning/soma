import { motion } from "motion/react";
import { useMemo } from "react";
import { ChevronDown, Mic, Paperclip, Send } from "react-feather";
import type { TextareaHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";
import { PolymorphButton } from "../actions/polymorph-button";

export type AiInputProps = {
	value: string;
	onChange: (value: string) => void;
	onSend?: () => void;
	onAttach?: () => void;
	onVoice?: () => void;
	modelLabel?: string;
	modelSelector?: ReactNode;
	placeholder?: string;
	disabled?: boolean;
	rows?: number;
	className?: string;
	textareaProps?: Omit<
		TextareaHTMLAttributes<HTMLTextAreaElement>,
		"value" | "onChange"
	>;
};

export function AiInput({
	value,
	onChange,
	onSend,
	onAttach,
	onVoice,
	modelLabel = "GPT-4o",
	modelSelector,
	placeholder = "Type your message...",
	disabled,
	rows = 3,
	className,
	textareaProps,
}: AiInputProps) {
	const { onKeyDown, ...restTextareaProps } = textareaProps ?? {};
	const trimmed = value.trim();
	const canSend = trimmed.length > 0 && !disabled;

	const footer = useMemo(
		() => (
			<div className="flex items-center gap-2 text-sm text-base-content/70">
				<PolymorphButton
					iconOnly
					size="sm"
					variant="ghost"
					leadingIcon={<Paperclip size={16} />}
					onClick={onAttach}
					aria-label="Attach"
					disabled={disabled}
				/>
				<PolymorphButton
					iconOnly
					size="sm"
					variant="ghost"
					leadingIcon={<Mic size={16} />}
					onClick={onVoice}
					aria-label="Voice"
					disabled={disabled}
				/>
				{modelSelector ?? (
					<div className="ml-1 inline-flex items-center gap-1 rounded-lg bg-base-200/70 px-3 py-1 text-sm font-semibold text-base-content/80">
						{modelLabel}
						<ChevronDown size={14} />
					</div>
				)}
			</div>
		),
		[disabled, modelLabel, modelSelector, onAttach, onVoice],
	);

	return (
		<div
			className={cn(
				"relative rounded-2xl border border-base-300/80 bg-base-100 shadow-inner",
				className,
			)}
		>
			<div className="px-4 pb-3 pt-3">
				<textarea
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							if (canSend) onSend?.();
							return;
						}
						onKeyDown?.(event);
					}}
					placeholder={placeholder}
					disabled={disabled}
					rows={rows}
					className="w-full resize-none bg-transparent text-base text-base-content outline-none placeholder:text-base-content/50"
					{...restTextareaProps}
				/>
			</div>

			<div className="flex items-center justify-between border-t border-base-200/80 px-4 py-3">
				{footer}
				<motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
					<PolymorphButton
						iconOnly
						size="lg"
						variant="secondary"
						leadingIcon={<Send size={16} />}
						onClick={onSend}
						disabled={!canSend}
						aria-label="Send message"
					/>
				</motion.div>
			</div>
		</div>
	);
}
