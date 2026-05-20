/**
 * Pins the Kbd primitive contract:
 *  - single key → <kbd class="kbd ...">
 *  - chord (array) → multiple <kbd>s with `+` separators
 *  - sizes map to daisy modifiers (kbd-xs/sm/lg/xl); md = no modifier
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kbd } from "./kbd";

describe("Kbd", () => {
	it("renders a single key as <kbd class='kbd ...'>", () => {
		const { container } = render(<Kbd>⌘</Kbd>);
		const kbd = container.querySelector("kbd");
		expect(kbd).not.toBeNull();
		expect(kbd?.className).toContain("kbd");
		expect(kbd?.textContent).toBe("⌘");
	});

	it("renders chord with `+` text nodes between keys (daisyUI docs shape)", () => {
		const { container } = render(<Kbd>{["⌘", "K"]}</Kbd>);
		const kbds = container.querySelectorAll("kbd");
		expect(kbds.length).toBe(2);
		expect(kbds[0].textContent).toBe("⌘");
		expect(kbds[1].textContent).toBe("K");
		// The `+` separator is a bare text node, matching daisy's docs.
		// Concatenating all child text should yield "⌘+K".
		expect(container.textContent).toBe("⌘+K");
	});

	it("auto-splits a concatenated unicode-glyph string into separate caps", () => {
		// Real call sites pass shortcuts like "⌘⇧F" or "⌘,". Without
		// auto-splitting these would render as a single keycap labelled
		// "⌘⇧F" — what the user reported as "⌘," appearing in the command
		// palette.
		const { container } = render(<Kbd>⌘⇧F</Kbd>);
		const kbds = container.querySelectorAll("kbd");
		expect(kbds.length).toBe(3);
		expect(kbds[0].textContent).toBe("⌘");
		expect(kbds[1].textContent).toBe("⇧");
		expect(kbds[2].textContent).toBe("F");
		expect(container.textContent).toBe("⌘+⇧+F");
	});

	it("splits a `+`-separated multi-char shortcut", () => {
		// "Ctrl+Shift+Del" should render three named keys, not split into
		// individual letters.
		const { container } = render(<Kbd>Ctrl+Shift+Del</Kbd>);
		const kbds = container.querySelectorAll("kbd");
		expect(kbds.length).toBe(3);
		expect(kbds[0].textContent).toBe("Ctrl");
		expect(kbds[1].textContent).toBe("Shift");
		expect(kbds[2].textContent).toBe("Del");
	});

	it("renders a single-character string as one cap", () => {
		const { container } = render(<Kbd>K</Kbd>);
		const kbds = container.querySelectorAll("kbd");
		expect(kbds.length).toBe(1);
		expect(kbds[0].textContent).toBe("K");
	});

	it("maps sizes to daisy modifiers", () => {
		const sizes = [
			{ size: "xs" as const, expected: "kbd-xs" },
			{ size: "sm" as const, expected: "kbd-sm" },
			{ size: "lg" as const, expected: "kbd-lg" },
			{ size: "xl" as const, expected: "kbd-xl" },
		];
		for (const { size, expected } of sizes) {
			const { container } = render(<Kbd size={size}>K</Kbd>);
			expect(container.querySelector("kbd")?.className).toContain(expected);
		}
	});

	it("md size produces no daisy modifier (daisyUI default)", () => {
		const { container } = render(<Kbd size="md">K</Kbd>);
		const cls = container.querySelector("kbd")?.className ?? "";
		expect(cls).not.toMatch(/kbd-(xs|sm|lg|xl)/);
		expect(cls).toContain("kbd");
	});
});
