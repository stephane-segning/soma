import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGraphemes } from "./use-graphemes";

describe("useGraphemes", () => {
	it("splits ASCII text into single-character segments", () => {
		const { result } = renderHook(() => useGraphemes("abc"));
		expect(result.current).toEqual(["a", "b", "c"]);
	});

	it("preserves multi-codepoint grapheme clusters as single segments", () => {
		// Family emoji is a single grapheme made of multiple codepoints joined by ZWJ.
		const family = "\u{1F469}‍\u{1F469}‍\u{1F467}";
		const { result } = renderHook(() => useGraphemes(family));
		expect(result.current).toEqual([family]);
	});

	it("returns an empty array for empty input", () => {
		const { result } = renderHook(() => useGraphemes(""));
		expect(result.current).toEqual([]);
	});
});
