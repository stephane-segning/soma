/**
 * PanelContainer layout contract — stable two-column positions.
 *
 * Each panel's position is determined by its index in `panels`. Odd
 * positions (1st, 3rd, 5th …) → column 1; even positions (2nd, 4th …)
 * → column 2. Collapsed panels live in the right rail. There is no
 * cap; every open panel renders in its assigned column.
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
	initiallyCollapsed = [],
}: {
	panelCount: number;
	initiallyCollapsed?: string[];
}) {
	const [collapsed, setCollapsed] = useState<Set<string>>(
		() => new Set(initiallyCollapsed),
	);
	return (
		<SomaIntlProvider>
			<PanelContainer
				collapsedIds={collapsed}
				onToggleCollapse={(id) => {
					setCollapsed((prev) => {
						const next = new Set(prev);
						if (next.has(id)) next.delete(id);
						else next.add(id);
						return next;
					});
				}}
				panels={makePanels(panelCount)}
			/>
		</SomaIntlProvider>
	);
}

function cardTitles(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll("section h2")).map(
		(h) => h.textContent ?? "",
	);
}

describe("PanelContainer two-column stable positions", () => {
	it("renders all open panels — no cap, no overflow", () => {
		const { container } = render(<Harness panelCount={5} />);
		expect(container.querySelectorAll("section").length).toBe(5);
	});

	it("places odd-position panels in column 1 and even-position in column 2", () => {
		const { container } = render(<Harness panelCount={5} />);
		const columns = container.querySelectorAll("[aria-label='Side panels'] > div > div");
		// 2 columns rendered (both have at least one open panel).
		expect(columns.length).toBe(2);
		const col1Titles = Array.from(columns[0].querySelectorAll("section h2")).map(
			(h) => h.textContent,
		);
		const col2Titles = Array.from(columns[1].querySelectorAll("section h2")).map(
			(h) => h.textContent,
		);
		// Panel 0, 2, 4 → col 1 ; Panel 1, 3 → col 2.
		expect(col1Titles).toEqual(["Panel 0", "Panel 2", "Panel 4"]);
		expect(col2Titles).toEqual(["Panel 1", "Panel 3"]);
	});

	it("when no panel is expanded, only the strip renders (no empty placeholder)", () => {
		const { container } = render(
			<Harness initiallyCollapsed={["p0", "p1", "p2"]} panelCount={3} />,
		);
		expect(container.querySelectorAll("section").length).toBe(0);
		expect(container.querySelector("aside")).not.toBeNull();
	});

	it("toggling a collapsed icon expands the panel into its assigned column", () => {
		const { container } = render(
			<Harness initiallyCollapsed={["p0", "p1", "p2"]} panelCount={3} />,
		);
		expect(cardTitles(container)).toEqual([]);

		// Click the second strip icon (Panel 1, an even-index/column-2 panel).
		const stripButtons = container.querySelectorAll("aside button");
		fireEvent.click(stripButtons[1]);

		// Panel 1 lives in column 2; column 1 is now empty.
		const titles = cardTitles(container);
		expect(titles).toEqual(["Panel 1"]);
		// 2 collapsed icons remain in the strip (p0, p2).
		expect(container.querySelectorAll("aside button").length).toBe(2);
	});

	it("a column with only one open panel takes the full height (flex-1)", () => {
		// Easier asserted by checking the Panel section has min-h-0 flex-1
		// classes; we trust the flex layout for the actual heights.
		const { container } = render(
			<Harness initiallyCollapsed={["p1", "p2"]} panelCount={3} />,
		);
		const card = container.querySelector("section");
		expect(card?.className).toContain("flex-1");
		expect(card?.className).toContain("min-h-0");
	});
});
