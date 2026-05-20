/**
 * Regression test — the slash menu's floating-ui VirtualElement must
 * read `clientRect()` afresh inside its `getBoundingClientRect` getter
 * rather than capturing the rect once at effect time. autoUpdate
 * calls the getter on every scroll/resize, so capturing the rect once
 * leaves the menu glued to its initial position when the user scrolls
 * the page.
 *
 * The current implementation also caches the last valid rect in a
 * ref so that when `clientRect()` transiently returns `null` (fast
 * edits, selection rebuilds) the menu stays anchored to the previous
 * caret position instead of teleporting to viewport (0, 0). This test
 * pins both contracts at the source level — we don't render the React
 * component because it depends on Tiptap editor instances that are
 * awkward to mock.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("CommandList floating-ui virtual element", () => {
	const src = readFileSync(resolve(__dirname, "command-list.tsx"), "utf8");

	it("reads clientRect() inside the getBoundingClientRect getter (not just once)", () => {
		// The getter must invoke `clientRect()` on every call — that's
		// what makes the menu follow the trigger character through page
		// scroll. The fresh call appears inside the `getBoundingClientRect`
		// function body.
		const getterBody = src.match(
			/getBoundingClientRect:\s*\(\)\s*=>\s*[{(][\s\S]*?(?:\}\s*,|\),)/,
		);
		expect(getterBody, "could not locate getBoundingClientRect getter").not.toBeNull();
		expect(getterBody?.[0]).toMatch(/clientRect\(\)/);
	});

	it("does not closure-capture the rect once at effect time", () => {
		// The old buggy form was `getBoundingClientRect: () => rect`
		// where `rect` was captured once. Make sure that exact shape
		// hasn't sneaked back in.
		expect(src).not.toMatch(/getBoundingClientRect:\s*\(\)\s*=>\s*rect\s*[,)]/);
	});

	it("falls back to the last valid rect when clientRect() returns null", () => {
		// The cache prevents the menu teleporting to viewport (0, 0)
		// during transient null-rect frames. Implementation detail: a
		// useRef called `lastValidRectRef`.
		expect(src).toMatch(/lastValidRectRef/);
	});
});
