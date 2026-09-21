/**
 * practice-scoring — pure functions for the `/spaces/:spaceId/practice`
 * typing drill: words-per-minute, accuracy, and completion detection.
 *
 * Kept free of React/backend imports so they're plain-Node testable
 * (`practice-scoring.test.ts`) and reusable if a second typing surface
 * (e.g. a future popup focus-task shell, ADR-0005 §10) ever needs the
 * same math.
 *
 * Both `should` and `is` are grapheme-cluster arrays (from
 * `@soma/ui/hooks/use-graphemes`), matching `CharDisplay`'s own props —
 * comparing at the grapheme level (not raw JS string indexing) keeps
 * multi-code-unit characters (emoji, accented letters) from mis-scoring.
 */

/**
 * Standard typing-test WPM: `(chars typed / 5) / minutes elapsed`. Zero
 * or negative elapsed time (or nothing typed yet) returns 0 rather than
 * `Infinity`/`NaN`.
 */
export function computeWpm(typedLength: number, elapsedMs: number): number {
	if (elapsedMs <= 0 || typedLength <= 0) return 0;
	const minutes = elapsedMs / 60_000;
	return typedLength / 5 / minutes;
}

/**
 * Fraction (0..1) of typed graphemes that match the target at the same
 * position. Empty input scores 0, not 1 — nothing typed isn't "fully
 * accurate", it's "no signal yet".
 */
export function computeAccuracy(should: readonly string[], is: readonly string[]): number {
	if (is.length === 0) return 0;
	let correct = 0;
	for (let i = 0; i < is.length; i += 1) {
		if (is[i] === should[i]) correct += 1;
	}
	return correct / is.length;
}

/**
 * The drill is complete once the typed grapheme count reaches the
 * target's — matches standard typing-test UX (stop as soon as the full
 * passage length is reached, regardless of correctness at that point).
 * An empty target is never "complete" (there's nothing to practice).
 */
export function isPracticeComplete(should: readonly string[], is: readonly string[]): boolean {
	return should.length > 0 && is.length >= should.length;
}
