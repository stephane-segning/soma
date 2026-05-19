/**
 * Regression test — Pill renders as a daisyUI badge so it inherits the
 * theme's badge surface and the `.badge-*` tone modifiers stay in
 * sync with the rest of the theme. The hand-rolled `bg-info/10 border
 * border-info/30` form looked like it came from a different design
 * system every time a daisyUI theme changed.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pill } from "./pill";

describe("Pill primitives", () => {
	it("renders as a daisyUI badge with the sm size", () => {
		const { container } = render(<Pill>Hello</Pill>);
		const span = container.firstChild as HTMLElement;
		expect(span.className).toContain("badge");
		expect(span.className).toContain("badge-sm");
	});

	it("applies the matching badge-* class for each tone", () => {
		const cases: Array<{ tone: "neutral" | "info" | "success" | "warning" | "error"; expected: string }> = [
			{ tone: "neutral", expected: "badge-ghost" },
			{ tone: "info", expected: "badge-info" },
			{ tone: "success", expected: "badge-success" },
			{ tone: "warning", expected: "badge-warning" },
			{ tone: "error", expected: "badge-error" },
		];
		for (const { tone, expected } of cases) {
			const { container } = render(<Pill tone={tone}>x</Pill>);
			const span = container.firstChild as HTMLElement;
			expect(span.className, `tone=${tone} should include ${expected}`).toContain(expected);
		}
	});

	it("renders a dot indicator when dot=true", () => {
		const { container } = render(<Pill dot>x</Pill>);
		const dot = container.querySelector("[aria-hidden]");
		expect(dot).not.toBeNull();
		expect(dot?.className).toContain("rounded-full");
	});

	it("adds animate-pulse when dot='pulse'", () => {
		const { container } = render(<Pill dot="pulse">x</Pill>);
		const dot = container.querySelector("[aria-hidden]");
		expect(dot?.className).toContain("animate-pulse");
	});
});
