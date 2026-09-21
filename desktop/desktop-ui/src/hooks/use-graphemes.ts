import { useMemo } from "react";

/**
 * Splits a string into grapheme clusters using Intl.Segmenter when available.
 * Falls back to Array.from for environments without Segmenter support.
 */
export function useGraphemes(value: string) {
	const segmenter = useMemo(
		() =>
			typeof Intl.Segmenter === "function"
				? new Intl.Segmenter(undefined, { granularity: "grapheme" })
				: null,
		[],
	);

	return useMemo(
		() =>
			segmenter
				? Array.from(segmenter.segment(value), ({ segment }) => segment)
				: Array.from(value),
		[segmenter, value],
	);
}
