/**
 * Regression test — MenuItem rows must NOT animate their background
 * colour on hover/active. A 150ms `transition-colors` made the row
 * "fill in" on hover, which reads to users as the item growing (the
 * filled-bg rectangle appears wider than the bare text). The fix is
 * to drop the transition class entirely — snap the highlight.
 *
 * This guards against re-adding `transition-colors` (or any
 * transition on bg / transform) on the primary row primitive.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MenuItem } from "./menu-shell";

describe("MenuItem row transitions", () => {
	it("does not declare any transition class", () => {
		const { getByRole } = render(<MenuItem label="Item" />);
		const button = getByRole("button");
		const classes = button.className;
		expect(classes).not.toMatch(/\btransition(-colors|-all|-transform)?\b/);
	});

	it("snaps to active state with no transition", () => {
		const { getByRole } = render(<MenuItem active label="Active item" />);
		const button = getByRole("button");
		expect(button.className).not.toMatch(
			/\btransition(-colors|-all|-transform)?\b/,
		);
		expect(button.className).toContain("bg-base-200");
	});
});
