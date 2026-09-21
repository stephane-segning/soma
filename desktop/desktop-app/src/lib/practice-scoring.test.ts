import { describe, expect, it } from "vitest";
import { computeAccuracy, computeWpm, isPracticeComplete } from "./practice-scoring";

describe("computeWpm", () => {
	it("computes the standard (chars / 5) / minutes formula", () => {
		// 100 chars in 60s = 20 "words" in 1 minute = 20 wpm.
		expect(computeWpm(100, 60_000)).toBe(20);
	});

	it("scales with elapsed time", () => {
		// 50 chars in 30s = 10 words in 0.5 min = 20 wpm.
		expect(computeWpm(50, 30_000)).toBe(20);
	});

	it("returns 0 for zero elapsed time instead of Infinity", () => {
		expect(computeWpm(50, 0)).toBe(0);
	});

	it("returns 0 for negative elapsed time instead of a negative rate", () => {
		expect(computeWpm(50, -1000)).toBe(0);
	});

	it("returns 0 when nothing was typed", () => {
		expect(computeWpm(0, 60_000)).toBe(0);
	});
});

describe("computeAccuracy", () => {
	it("returns 1 when every typed grapheme matches", () => {
		expect(computeAccuracy(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
	});

	it("returns the fraction of correct positions, not a boolean", () => {
		expect(computeAccuracy(["a", "b", "c", "d"], ["a", "x", "c", "y"])).toBe(0.5);
	});

	it("scores against typed length, not target length (partial attempt)", () => {
		expect(computeAccuracy(["a", "b", "c", "d"], ["a", "b"])).toBe(1);
	});

	it("returns 0 for empty input rather than 1 (no signal yet, not perfect)", () => {
		expect(computeAccuracy(["a", "b", "c"], [])).toBe(0);
	});

	it("treats grapheme clusters as atomic units, not JS string indices", () => {
		expect(computeAccuracy(["❤️", "!"], ["❤️", "!"])).toBe(1);
	});
});

describe("isPracticeComplete", () => {
	it("is false while the typed length is short of the target", () => {
		expect(isPracticeComplete(["a", "b", "c"], ["a"])).toBe(false);
	});

	it("is true once the typed length reaches the target length", () => {
		expect(isPracticeComplete(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
	});

	it("is true if the user types past the target length", () => {
		expect(isPracticeComplete(["a", "b"], ["a", "b", "c"])).toBe(true);
	});

	it("is false for an empty target — nothing to complete", () => {
		expect(isPracticeComplete([], [])).toBe(false);
	});
});
