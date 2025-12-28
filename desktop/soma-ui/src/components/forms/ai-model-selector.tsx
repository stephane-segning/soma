import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "react-feather";
import { cn } from "../../utils/cn";
import { PolymorphButton } from "../actions/polymorph-button";

export type AiModelOption = {
	id: string;
	label: string;
	description?: string;
	hint?: string;
};

export type AiModelSelectorProps = {
	options: AiModelOption[];
	value: string;
	onChange: (modelId: string) => void;
	disabled?: boolean;
	className?: string;
	size?: "sm" | "md";
};

export function AiModelSelector({
	options,
	value,
	onChange,
	disabled,
	className,
	size = "md",
}: AiModelSelectorProps) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		window.addEventListener("mousedown", onClick);
		return () => window.removeEventListener("mousedown", onClick);
	}, [open]);

	const selected = options.find((opt) => opt.id === value) ?? options[0];

	return (
		<div ref={ref} className={cn("relative inline-flex", className)}>
			<PolymorphButton
				size={size}
				variant="ghost"
				trailingIcon={<ChevronDown size={14} />}
				onClick={() => setOpen((state) => !state)}
				disabled={disabled}
			>
				{selected?.label ?? "Select model"}
			</PolymorphButton>

			<AnimatePresence>
				{open ? (
					<motion.div
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 4 }}
						transition={{ duration: 0.12 }}
						className="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-xl border border-base-300/70 bg-base-100 shadow-xl"
					>
						<div className="max-h-64 overflow-auto py-1">
							{options.map((opt) => {
								const active = opt.id === value;
								return (
									<button
										key={opt.id}
										type="button"
										className={cn(
											"flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition",
											active ? "bg-base-200/80" : "hover:bg-base-200/60",
										)}
										onClick={() => {
											onChange(opt.id);
											setOpen(false);
										}}
									>
										<div className="flex w-full items-center justify-between">
											<span className="text-sm font-semibold">{opt.label}</span>
											{opt.hint ? (
												<span className="text-[11px] text-base-content/60">
													{opt.hint}
												</span>
											) : null}
										</div>
										{opt.description ? (
											<p className="text-xs text-base-content/70">
												{opt.description}
											</p>
										) : null}
									</button>
								);
							})}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
