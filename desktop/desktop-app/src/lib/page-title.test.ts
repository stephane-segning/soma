import { describe, expect, it } from "vitest";
import {
	derivePageTitle,
	extractHeadingText,
	type MinimalProseMirrorNode,
	PAGE_TITLE_MAX_LENGTH,
	titleTracksHeading,
	truncateTitle,
} from "./page-title";

function doc(...headingContent: MinimalProseMirrorNode[]): MinimalProseMirrorNode {
	return { type: "doc", content: [{ type: "heading", content: headingContent }, { type: "paragraph" }] };
}

function text(value: string): MinimalProseMirrorNode {
	return { type: "text", text: value };
}

describe("extractHeadingText", () => {
	it("extracts plain text from a simple heading", () => {
		expect(extractHeadingText(doc(text("Production readiness notes")))).toBe("Production readiness notes");
	});

	it("concatenates multiple text runs regardless of marks", () => {
		// Tiptap splits a heading into one text node per distinct mark set —
		// e.g. "Q3 " (plain) + "Planning" (bold) — but marks are irrelevant
		// to the derived title, only the text itself is.
		const heading = doc(text("Q3 "), { type: "text", text: "Planning" });
		expect(extractHeadingText(heading)).toBe("Q3 Planning");
	});

	it("collapses internal whitespace and trims the ends", () => {
		expect(extractHeadingText(doc(text("  Roadmap   for   Q3  ")))).toBe("Roadmap for Q3");
	});

	it("collapses a pasted newline into a single space", () => {
		expect(extractHeadingText(doc(text("Line one\nLine two")))).toBe("Line one Line two");
	});

	it("returns an empty string for a heading with no content", () => {
		expect(extractHeadingText({ type: "doc", content: [{ type: "heading" }] })).toBe("");
	});

	it("returns an empty string for a whitespace-only heading", () => {
		expect(extractHeadingText(doc(text("   ")))).toBe("");
	});

	it("returns an empty string when the first node isn't a heading", () => {
		expect(extractHeadingText({ type: "doc", content: [{ type: "paragraph", content: [text("oops")] }] })).toBe("");
	});

	it("returns an empty string for a missing or malformed doc", () => {
		expect(extractHeadingText(null)).toBe("");
		expect(extractHeadingText(undefined)).toBe("");
		expect(extractHeadingText({})).toBe("");
	});

	it("skips a non-text inline node (e.g. the editor's textRotate atom) without throwing", () => {
		const heading = doc(text("Hello "), { type: "textRotate", content: undefined }, text("world"));
		expect(extractHeadingText(heading)).toBe("Hello world");
	});
});

describe("truncateTitle", () => {
	it("returns short text unchanged", () => {
		expect(truncateTitle("Short title")).toBe("Short title");
	});

	it("returns text exactly at the limit unchanged", () => {
		const exact = "x".repeat(PAGE_TITLE_MAX_LENGTH);
		expect(truncateTitle(exact)).toBe(exact);
	});

	it("truncates long text and appends a single ellipsis", () => {
		const long = "x".repeat(PAGE_TITLE_MAX_LENGTH + 50);
		const result = truncateTitle(long);
		expect(result).toBe(`${"x".repeat(PAGE_TITLE_MAX_LENGTH)}…`);
		expect(result.length).toBe(PAGE_TITLE_MAX_LENGTH + 1);
	});

	it("trims trailing whitespace the cut exposes before appending the ellipsis", () => {
		const long = `${"x".repeat(PAGE_TITLE_MAX_LENGTH - 1)}   long tail past the limit`;
		expect(truncateTitle(long)).toBe(`${"x".repeat(PAGE_TITLE_MAX_LENGTH - 1)}…`);
	});

	it("respects a custom maxLength", () => {
		expect(truncateTitle("Hello world", 5)).toBe("Hello…");
	});
});

describe("derivePageTitle", () => {
	it("uses the heading text when present", () => {
		expect(derivePageTitle(doc(text("Production readiness notes")), { fallback: "Untitled" })).toBe(
			"Production readiness notes",
		);
	});

	it("falls back when the heading is empty", () => {
		expect(derivePageTitle({ type: "doc", content: [{ type: "heading" }] }, { fallback: "Untitled" })).toBe("Untitled");
	});

	it("falls back when the heading is whitespace-only", () => {
		expect(derivePageTitle(doc(text("   ")), { fallback: "Untitled" })).toBe("Untitled");
	});

	it("falls back for a missing doc", () => {
		expect(derivePageTitle(null, { fallback: "Untitled" })).toBe("Untitled");
	});

	it("truncates a long derived title", () => {
		const long = "x".repeat(PAGE_TITLE_MAX_LENGTH + 10);
		expect(derivePageTitle(doc(text(long)), { fallback: "Untitled" })).toBe(`${"x".repeat(PAGE_TITLE_MAX_LENGTH)}…`);
	});

	it("respects a custom maxLength end to end", () => {
		expect(derivePageTitle(doc(text("Hello world")), { fallback: "Untitled", maxLength: 5 })).toBe("Hello…");
	});
});

describe("titleTracksHeading", () => {
	const options = { fallback: "Untitled" };

	it("is true when the current title matches the derived title", () => {
		expect(titleTracksHeading("Roadmap", doc(text("Roadmap")), options)).toBe(true);
	});

	it("is false when the current title diverges (an explicit rename)", () => {
		expect(titleTracksHeading("Renamed by hand", doc(text("Roadmap")), options)).toBe(false);
	});

	it("is true for a freshly created page whose title equals the fallback", () => {
		expect(titleTracksHeading("Untitled", { type: "doc", content: [{ type: "heading" }] }, options)).toBe(true);
	});
});
