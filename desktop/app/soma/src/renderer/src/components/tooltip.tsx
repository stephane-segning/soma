import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import {
	FloatingArrow,
	FloatingPortal,
	offset,
	shift,
	useFloating,
	useHover,
	useInteractions,
} from "@floating-ui/react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/cn";

type TooltipProps = {
	label: ReactNode;
	children: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	className?: string;
};

function Tooltip({
	label,
	children,
	open = false,
	onOpenChange,
	className,
}: TooltipProps): React.JSX.Element {
	const { t } = useTranslation("common");
	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange,
		middleware: [offset(8), shift({ padding: 8 })],
		placement: "top",
	});

	const hover = useHover(context, { delay: 150, move: false });
	const { getReferenceProps, getFloatingProps } = useInteractions([hover]);

	return (
		<>
			<span
				ref={refs.setReference}
				{...getReferenceProps()}
				aria-describedby={t("components.tooltip.ariaLabel", "Tooltip")}
			>
				{children}
			</span>
			<FloatingPortal>
				<AnimatePresence>
					{open ? (
						<motion.div
							ref={refs.setFloating}
							style={floatingStyles}
							{...getFloatingProps()}
							initial={{ opacity: 0, scale: 0.98 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.98 }}
							transition={{ duration: 0.12 }}
							className={cn(
								"tooltip tooltip-open bg-base-200 text-base-content rounded-box px-3 py-2 text-sm shadow-lg border border-base-300",
								className,
							)}
						>
							{label}
							<FloatingArrow
								context={context}
								className="fill-neutral stroke-neutral/60"
								height={8}
								width={12}
							/>
						</motion.div>
					) : null}
				</AnimatePresence>
			</FloatingPortal>
		</>
	);
}

export { Tooltip };
