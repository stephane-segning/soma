/**
 * Locks the narrow-tier summon rule, including the dead end that the
 * boolean-only heuristic used to produce.
 *
 * The regression this file exists for: with two panels sharing the
 * left column and both expanded at mount (restored chip state),
 * `hasContent` is true on the first render and never stops being true,
 * so the old empty -> non-empty transition never fired and the rail
 * could not be opened at all at a phone/split-view width. The chip
 * read pressed and nothing rendered.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNarrowOverlayVisibility } from "./use-narrow-overlay-visibility";
import type { ShellTier } from "./use-shell-tier";

type Args = { tier: ShellTier; hasContent: boolean; summonKey?: string };

const run = (initial: Args) =>
	renderHook(({ tier, hasContent, summonKey }: Args) => useNarrowOverlayVisibility(tier, hasContent, summonKey), {
		initialProps: initial,
	});

describe("useNarrowOverlayVisibility", () => {
	it("mirrors content at the comfortable tier", () => {
		const { result, rerender } = run({
			tier: "comfortable",
			hasContent: true,
			summonKey: "pages",
		});
		expect(result.current).toBe(true);
		rerender({ tier: "comfortable", hasContent: false, summonKey: "" });
		expect(result.current).toBe(false);
	});

	it("stays hidden at a narrow tier for panels that were already expanded at mount", () => {
		const { result } = run({
			tier: "verySmall",
			hasContent: true,
			summonKey: "nav,pages",
		});
		expect(result.current).toBe(false);
	});

	it("summons when the user swaps one panel for another without emptying the column", () => {
		// The exact dead end: both panels expanded at mount, so
		// `hasContent` is true throughout and never transitions.
		const { result, rerender } = run({
			tier: "tight",
			hasContent: true,
			summonKey: "nav,pages",
		});
		expect(result.current).toBe(false);

		rerender({ tier: "tight", hasContent: true, summonKey: "nav" }); // collapse Pages
		expect(result.current).toBe(true);
	});

	it("summons on a plain open at a narrow tier", () => {
		const { result, rerender } = run({
			tier: "tight",
			hasContent: false,
			summonKey: "",
		});
		expect(result.current).toBe(false);
		rerender({ tier: "tight", hasContent: true, summonKey: "pages" });
		expect(result.current).toBe(true);
	});

	it("hides again when the column empties, and reopens on the next summon", () => {
		const { result, rerender } = run({
			tier: "tight",
			hasContent: false,
			summonKey: "",
		});
		rerender({ tier: "tight", hasContent: true, summonKey: "pages" });
		expect(result.current).toBe(true);
		rerender({ tier: "tight", hasContent: false, summonKey: "" }); // dismissed
		expect(result.current).toBe(false);
		rerender({ tier: "tight", hasContent: true, summonKey: "pages" });
		expect(result.current).toBe(true);
	});

	it("does not dock a narrow-tier rail just because the tier widened and narrowed again", () => {
		const { result, rerender } = run({
			tier: "comfortable",
			hasContent: true,
			summonKey: "pages",
		});
		expect(result.current).toBe(true);
		rerender({ tier: "tight", hasContent: true, summonKey: "pages" });
		expect(result.current).toBe(false);
	});

	it("keeps the old transition heuristic when no key is supplied", () => {
		const { result, rerender } = run({ tier: "tight", hasContent: false });
		rerender({ tier: "tight", hasContent: true });
		expect(result.current).toBe(true);
	});
});
