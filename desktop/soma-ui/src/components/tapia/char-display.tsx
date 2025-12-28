import { motion } from "motion/react";
import { memo, useMemo } from "react";
import { cn } from "../../utils/cn";

export type CharDisplayProps = {
	shouldText: string;
	isText: string;
	className?: string;
};

type SingleCharProps = {
	char: string;
};

function SingleChar({ char }: SingleCharProps) {
	if (char === " ") {
		return <span className="w-8 block h-full" />;
	}
	return char;
}

export const CharDisplay = memo(function CharDisplay({
	shouldText,
	isText,
	className,
}: CharDisplayProps) {
	const expected = useMemo(() => Array.from(shouldText), [shouldText]);
	const actual = useMemo(() => Array.from(isText), [isText]);

	const cells = useMemo(
		() =>
			expected.map((char, index) => {
				const hasUserChar = index < actual.length;
				const userChar = actual[index];

				if (!hasUserChar) {
					return (
						<span
							key={index}
							className="align-baseline leading-none text-base-content/80"
						>
							<SingleChar char={char} />
						</span>
					);
				}

				if (userChar === char) {
					return (
						<span
							key={index}
							className="align-baseline leading-none text-success"
						>
							<SingleChar char={char} />
						</span>
					);
				}

				return (
					<span
						key={index}
						className="relative inline-flex min-w-[0.9ch] items-end justify-center align-baseline"
					>
						<motion.span
							initial={{ y: -2, opacity: 0 }}
							animate={{ y: -8, opacity: 1 }}
							transition={{ duration: 0.18, ease: "easeOut" }}
							className="pointer-events-none absolute bottom-3/6 left-1/2 -translate-x-1/2 leading-none text-success"
						>
							<SingleChar char={char} />
						</motion.span>
						<span className="leading-none text-error line-through">
							<SingleChar char={userChar} />
						</span>
					</span>
				);
			}),
		[actual, expected],
	);

	return (
		<div
			className={cn(
				"flex text-5xl font-bold flex-wrap gap-1 font-mono",
				className,
			)}
		>
			{cells}
		</div>
	);
});
