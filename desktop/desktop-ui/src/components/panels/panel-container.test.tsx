/**
 * PanelContainer contract — renders the expanded subset of the panel
 * inventory as a vertical full-width stack.
 *
 * The chip strip moved out (it now lives in `PanelChipBar`, dropped
 * into `DesktopShell`'s top-corner slots), so PanelContainer is now a
 * thin composition over `PanelStack`. Tests focus on the filter +
 * stack contract.
 */
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import { PanelContainer, type PanelDescriptor } from "./panel-container";

function makePanels(count: number): PanelDescriptor[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i}`,
		title: `Panel ${i}`,
		icon: <span data-testid={`icon-${i}`}>·</span>,
		content: <div>content {i}</div>,
	}));
}

function Harness({
	panelCount,
	initialExpanded,
}: {
	panelCount: number;
	initialExpanded: string[];
}) {
	const [expanded, setExpanded] = useState<Set<string>>(
		() => new Set(initialExpanded),
	);
	return (
		<SomaIntlProvider>
			<PanelContainer
				expandedIds={expanded}
				onCollapse={(id) => {
					setExpanded((prev) => {
						const next = new Set(prev);
						next.delete(id);
						return next;
					});
				}}
				panels={makePanels(panelCount)}
			/>
		</SomaIntlProvider>
	);
}

function panelTitles(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll("section h2")).map(
		(h) => h.textContent ?? "",
	);
}

describe("PanelContainer", () => {
	it("renders only the panels whose ids are in expandedIds", () => {
		const { container } = render(
			<Harness initialExpanded={["p0", "p2", "p4"]} panelCount={5} />,
		);
		expect(panelTitles(container)).toEqual(["Panel 0", "Panel 2", "Panel 4"]);
	});

	it("returns null when no panels are expanded (no DOM)", () => {
		const { container } = render(
			<Harness initialExpanded={[]} panelCount={3} />,
		);
		expect(container.querySelectorAll("section").length).toBe(0);
	});

	it("preserves the panels' inventory order, not the order of expansion", () => {
		// Even if the expanded set was populated in a different order than
		// the inventory, the stack reflects inventory order.
		const { container } = render(
			<Harness initialExpanded={["p2", "p0", "p1"]} panelCount={3} />,
		);
		expect(panelTitles(container)).toEqual(["Panel 0", "Panel 1", "Panel 2"]);
	});

	it("clicking a panel's collapse button removes it from the expanded set", () => {
		const { container } = render(
			<Harness initialExpanded={["p0", "p1"]} panelCount={2} />,
		);
		expect(panelTitles(container)).toEqual(["Panel 0", "Panel 1"]);

		// Each panel header carries a single `−` collapse button (aria-label
		// "Collapse panel" via i18n).
		const collapseButtons = container.querySelectorAll(
			"[aria-label='Collapse panel']",
		);
		expect(collapseButtons.length).toBe(2);

		fireEvent.click(collapseButtons[0]);
		expect(panelTitles(container)).toEqual(["Panel 1"]);
	});

	it("each rendered panel card has flex-1 + min-h-0 so heights split evenly", () => {
		const { container } = render(
			<Harness initialExpanded={["p0", "p1"]} panelCount={2} />,
		);
		const cards = container.querySelectorAll("section");
		expect(cards.length).toBe(2);
		for (const card of cards) {
			expect(card.className).toContain("flex-1");
			expect(card.className).toContain("min-h-0");
		}
	});
});
