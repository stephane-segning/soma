import { motion } from "motion/react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { useMemo } from "react";
import { ChevronDown, Mic, Paperclip, Send } from "react-feather";
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
			<div className="flex items-center gap-2 text-base-content/70 text-sm">
				<PolymorphButton
					aria-label="Attach"
					disabled={disabled}
					iconOnly
					leadingIcon={<Paperclip size={16} />}
					onClick={onAttach}
					size="sm"
					variant="ghost"
				/>
				<PolymorphButton
					aria-label="Voice"
					disabled={disabled}
					iconOnly
					leadingIcon={<Mic size={16} />}
					onClick={onVoice}
					size="sm"
					variant="ghost"
				/>
				{modelSelector ?? (
					<div className="ml-1 inline-flex items-center gap-1 rounded-lg bg-base-200/70 px-3 py-1 font-semibold text-base-content/80 text-sm">
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
				"relative border border-base-300/80 bg-base-100",
				className,
			)}
		>
			<div className="px-4 pt-3 pb-3">
				<textarea
					className="w-full resize-none bg-transparent text-base text-base-content outline-none placeholder:text-base-content/50"
					disabled={disabled}
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
					rows={rows}
					value={value}
					{...restTextareaProps}
				/>
			</div>

			<div className="flex items-center justify-between border-base-200/80 border-t px-4 py-3">
				{footer}
				<motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
					<PolymorphButton
						aria-label="Send message"
						disabled={!canSend}
						iconOnly
						leadingIcon={<Send size={16} />}
						onClick={onSend}
						size="lg"
						variant="secondary"
					/>
				</motion.div>
			</div>
		</div>
	);
}
