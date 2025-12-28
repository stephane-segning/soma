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
		return <span className={cn(className, "w-8 inline-block h-14")} />;
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
						key={index}
						className="relative align-baseline leading-none text-base-content/80"
					>
						<SingleChar char={char} />
					</span>
				);
			}

			if (userChar === char) {
				return (
					<span
						key={index}
						ref={ref as React.RefObject<HTMLSpanElement>}
						className={cn(
							typerClass,
							"relative align-baseline leading-none text-success",
						)}
					>
						<SingleChar char={char} />
					</span>
				);
			}

			return (
				<span
					key={index}
					ref={ref as React.RefObject<HTMLSpanElement>}
					className={cn(
						typerClass,
						"relative inline-flex items-end justify-center align-baseline",
					)}
				>
					<motion.span
						initial={{ y: -2, opacity: 0 }}
						animate={{ y: -8, opacity: 1 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
						className="pointer-events-none absolute bottom-3/6 left-1/2 -translate-x-1/2 leading-none text-success"
					>
						<SingleChar char={char} />
					</motion.span>
					<SingleChar
						char={userChar}
						className="leading-none text-error line-through"
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
			ref={containerRef}
			className={cn("w-full overflow-x-auto h-30 scrollbar-none", className)}
		>
			<div
				ref={innerRef}
				className="inline-flex flex-nowrap items-end gap-1 font-mono text-6xl font-bold py-1 min-h-full"
			>
				{cells}
			</div>
		</div>
	);
});
