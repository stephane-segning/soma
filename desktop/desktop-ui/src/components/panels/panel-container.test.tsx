/**
 * Regression test — PanelContainer must never render more than
 * `maxExpanded` panels as cards, AND must actively evict overflow
 * into the caller's collapsedIds via onToggleCollapse so the parent
 * state catches up. Without the auto-evict, a third "open" panel
 * silently disappeared into the strip while the caller still thought
 * it was expanded — confusing UX, exactly what the user reported.
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

describe("PanelContainer cap policy", () => {
	it("renders at most maxExpanded (default 2) panels as cards", () => {
		const { container } = render(<Harness panelCount={5} />);
		const cards = container.querySelectorAll("section");
		expect(cards.length).toBe(2);
	});

	it("renders overflow panels into the strip without mutating caller state", () => {
		const { container, getAllByRole } = render(<Harness panelCount={5} />);
		// 5 panels - 2 visible cards = 3 in strip.
		const stripButtons = getAllByRole("button", {
			name: /Panel \d/,
		}).filter((btn) => btn.closest("aside"));
		expect(stripButtons.length).toBe(3);
		const cards = container.querySelectorAll("section");
		expect(cards.length).toBe(2);
	});

	it("clicking an overflow strip icon swaps it in for the oldest visible", () => {
		// Regression for the round-5 click-loop bug: the previous auto-evict
		// useEffect immediately re-collapsed any panel the user un-collapsed
		// from the strip. The new smart handler instead evicts the oldest
		// visible panel and surfaces the clicked one — a real swap.
		const { container, getAllByRole } = render(<Harness panelCount={5} />);

		const before = Array.from(container.querySelectorAll("section h2")).map((h) =>
			h.textContent,
		);
		// Sanity: first two panels render initially.
		expect(before).toEqual(["Panel 0", "Panel 1"]);

		const stripButtons = getAllByRole("button", { name: /Panel \d/ }).filter(
			(btn) => btn.closest("aside"),
		);
		// First strip icon is Panel 2 (the first overflow).
		fireEvent.click(stripButtons[0]);

		const after = Array.from(container.querySelectorAll("section h2")).map((h) =>
			h.textContent,
		);
		// Panel 0 evicted; Panel 2 surfaced. Cap stays at 2.
		expect(after).toEqual(["Panel 1", "Panel 2"]);
	});

	it("when no panel is expanded, only the right rail renders (no empty placeholder)", () => {
		const { container } = render(
			<Harness initiallyCollapsed={["p0", "p1", "p2"]} panelCount={3} />,
		);
		expect(container.querySelectorAll("section").length).toBe(0);
		expect(container.querySelector("aside")).not.toBeNull();
	});

	it("toggling a collapsed icon re-expands the panel (within the cap)", () => {
		const { container, getAllByRole } = render(
			<Harness initiallyCollapsed={["p0", "p1", "p2"]} panelCount={3} />,
		);
		expect(container.querySelectorAll("section").length).toBe(0);

		const stripButtons = getAllByRole("button");
		fireEvent.click(stripButtons[0]);

		// Now one panel is open; still no overflow (within the cap of 2).
		expect(container.querySelectorAll("section").length).toBe(1);
	});
});
