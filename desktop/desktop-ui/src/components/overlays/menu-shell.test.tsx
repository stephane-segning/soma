/**
 * Locks the visual token contract of MenuShell + MenuItem so anyone
 * changing the primitives sees the diff. The whole point of these
 * primitives is to keep slash menu / context menu / AI bar action list
 * looking like siblings — if someone tweaks the padding or radius in
 * isolation, the menus drift apart again.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MenuItem, MenuSectionLabel, MenuShell } from "./menu-shell";

describe("MenuShell", () => {
	it("renders with glass-panel + elevated shadow + consistent padding", () => {
		const { container } = render(<MenuShell>x</MenuShell>);
		const shell = container.firstChild as HTMLElement;
		const cls = shell.className;
		expect(cls).toContain("glass-panel");
		expect(cls).toContain("shadow-elevated");
		expect(cls).toContain("p-1");
		expect(cls).toContain("min-w-48");
		// Default semantic role is "menu" so screen readers announce it.
		expect(shell.getAttribute("role")).toBe("menu");
	});

	it("respects a width override (e.g. for the slash menu's w-80)", () => {
		const { container } = render(<MenuShell width="w-80">x</MenuShell>);
		const shell = container.firstChild as HTMLElement;
		expect(shell.className).toContain("w-80");
		expect(shell.className).not.toContain("min-w-48");
	});
});

describe("MenuItem", () => {
	it("renders icon + label + shortcut with the shared row classes", () => {
		const { getByRole } = render(
			<MenuItem icon={<span data-testid="icon" />} label="Open" shortcut="⌘O" />,
		);
		const button = getByRole("button");
		expect(button.className).toContain("rounded-md");
		expect(button.className).toContain("px-2");
		expect(button.className).toContain("py-1.5");
		expect(button.className).toContain("text-sm");
		expect(button.textContent).toContain("Open");
		// Kbd auto-splits a 2-char glyph string into separate caps with a
		// bare `+` between, so the concatenated text reads "⌘+O".
		expect(button.textContent).toContain("⌘+O");
	});

	it("applies active styling when active=true", () => {
		const { getByRole } = render(<MenuItem active label="Active" />);
		const button = getByRole("button");
		expect(button.className).toContain("bg-base-200");
		expect(button.getAttribute("aria-selected")).toBe("true");
	});

	it("applies danger tone hover styling", () => {
		const { getByRole } = render(<MenuItem label="Delete" tone="danger" />);
		const button = getByRole("button");
		// Danger rows tint to the error color on hover rather than base-200.
		expect(button.className).toContain("hover:bg-error");
	});

	it("dims and disables when disabled=true", () => {
		const { getByRole } = render(<MenuItem disabled label="Off" />);
		const button = getByRole("button") as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(button.className).toContain("opacity-50");
		expect(button.className).toContain("cursor-not-allowed");
	});
});

describe("MenuSectionLabel", () => {
	it("renders a small uppercase header", () => {
		const { container } = render(<MenuSectionLabel>Text</MenuSectionLabel>);
		const label = container.firstChild as HTMLElement;
		expect(label.className).toContain("uppercase");
		expect(label.className).toContain("text-xs");
		expect(label.textContent).toBe("Text");
	});
});
