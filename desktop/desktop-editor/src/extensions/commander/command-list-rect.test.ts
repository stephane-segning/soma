/**
 * Regression test — the slash menu's floating-ui VirtualElement must
 * read `clientRect()` afresh inside its `getBoundingClientRect` getter
 * rather than capturing the rect once at effect time. autoUpdate
 * calls the getter on every scroll/resize, so capturing the rect
 * once leaves the menu glued to its initial position when the user
 * scrolls the page.
 *
 * We don't render the React component here (it depends on tiptap
 * editor instances that are awkward to mock). Instead we verify the
 * source file uses the dynamic-getter shape.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("CommandList floating-ui virtual element", () => {
	it("reads clientRect() inside the getBoundingClientRect getter (not just once)", () => {
		const src = readFileSync(resolve(__dirname, "command-list.tsx"), "utf8");
		// The fix replaces `getBoundingClientRect: () => rect` (closure-
		// captured) with `getBoundingClientRect: () => clientRect() ?? …`
		// (re-read on every floating-ui recompute).
		expect(src).toMatch(/getBoundingClientRect:\s*\(\)\s*=>\s*clientRect\(\)/);
		// And it must NOT have the stale-closure form.
		expect(src).not.toMatch(/getBoundingClientRect:\s*\(\)\s*=>\s*rect\b/);
	});
});
