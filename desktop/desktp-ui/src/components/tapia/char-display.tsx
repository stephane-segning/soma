/** biome-ignore-all lint/suspicious/noArrayIndexKey: idx iterate are safe here */
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useRef } from "react";
import { cn } from "../../utils/cn";

export type CharDisplayProps = {
	shouldGraphemes: string[];
	isGraphemes: string[];
	className?: string;
};

type SingleCharProps = {
	char: string;
	className?: string;
};

function SingleChar({ char, className }: SingleCharProps) {
	if (char === " ") {
		return <span className={cn(className, "inline-block h-14 w-8")} />;
	}
	return (
		<span className={cn(className, "inline-block align-baseline")}>{char}</span>
	);
}

export const CharDisplay = memo(function CharDisplay({
	shouldGraphemes,
	isGraphemes,
	className,
}: CharDisplayProps) {
	const expected = shouldGraphemes;
	const actual = isGraphemes;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const innerRef = useRef<HTMLDivElement | null>(null);
	const cursorRef = useRef<HTMLSpanElement | null>(null);

	const cells = useMemo(() => {
		const lastIndex = Math.max(actual.length - 1, 0);
		return expected.map((char, index) => {
			const hasUserChar = index < actual.length;
			const userChar = actual[index];
			const ref = index === lastIndex ? cursorRef : undefined;
			const typerClass =
				index === lastIndex
					? "after:absolute after:bottom-0 after:right-0 after:h-14 after:w-[0.125em] after:animate-caret after:bg-black"
					: undefined;

			if (!hasUserChar) {
				return (
					<span
						className="relative align-baseline text-base-content/80 leading-none"
						key={index}
					>
						<SingleChar char={char} />
					</span>
				);
			}

			if (userChar === char) {
				return (
					<span
						className={cn(
							typerClass,
							"relative align-baseline text-success leading-none",
						)}
						key={index}
						ref={ref as React.RefObject<HTMLSpanElement>}
					>
						<SingleChar char={char} />
					</span>
				);
			}

			return (
				<span
					className={cn(
						typerClass,
						"relative inline-flex items-end justify-center align-baseline",
					)}
					key={index}
					ref={ref as React.RefObject<HTMLSpanElement>}
				>
					<motion.span
						animate={{ y: -8, opacity: 1 }}
						className="pointer-events-none absolute bottom-3/6 left-1/2 -translate-x-1/2 text-success leading-none"
						initial={{ y: -2, opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
					>
						<SingleChar char={char} />
					</motion.span>
					<SingleChar
						char={userChar}
						className="text-error leading-none line-through"
					/>
				</span>
			);
		});
	}, [actual, expected]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: It's controlled via refs
	useEffect(() => {
		const container = containerRef.current;
		const inner = innerRef.current;
		const cursor = cursorRef.current;
		if (container && cursor && inner) {
			const target =
				cursor.offsetLeft + cursor.clientWidth / 2 - container.clientWidth / 2;
			const maxScroll = Math.max(0, inner.scrollWidth - container.clientWidth);
			const nextScrollLeft = Math.max(0, Math.min(target, maxScroll));
			container.scrollTo({ left: nextScrollLeft, behavior: "smooth" });
		}
	}, [actual.length, cells]);

	return (
		<div
			className={cn("scrollbar-none h-30 w-full overflow-x-auto", className)}
			ref={containerRef}
		>
			<div
				className="inline-flex min-h-full flex-nowrap items-end gap-1 py-1 font-bold font-mono text-6xl"
				ref={innerRef}
			>
				{cells}
			</div>
		</div>
	);
});
