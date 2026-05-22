/**
 * Regression test for the slash-menu "scales on hover" symptom.
 *
 * The visible jitter the user reported was *not* a CSS transform — it
 * was our `scrollIntoView` effect firing on every mouseenter (because
 * mouseenter sets `activeIndex`, and the effect was unconditionally
 * keyed on `activeIndex`). When the user mouse-hovered a row already
 * on screen, the menu re-scrolled internally and the floating-ui
 * autoUpdate then re-positioned the popover — looking like a tiny
 * zoom each hover.
 *
 * Fix: only scroll on keyboard navigation. This test pins that:
 *   - mouseenter on a row does NOT call scrollIntoView
 *   - ArrowDown DOES call scrollIntoView
 */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import { SlashMenu, type SlashMenuItem } from "./slash-menu";

function makeItems(count: number): SlashMenuItem[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `cmd-${i}`,
		label: `Command ${i}`,
		onSelect: vi.fn(),
		section: "text" as const,
	}));
}

function setup(items = makeItems(10)) {
	// biome-ignore lint/suspicious/noExplicitAny: jsdom prototype hole
	(Element.prototype as any).scrollIntoView ??= () => {};
	const scrollSpy = vi
		.spyOn(Element.prototype, "scrollIntoView")
		.mockImplementation(() => {});
	const onClose = vi.fn();
	const utils = render(
		<SomaIntlProvider>
			<SlashMenu
				captureScope="window"
				items={items}
				onClose={onClose}
				query=""
			/>
		</SomaIntlProvider>,
	);
	return { ...utils, scrollSpy };
}

describe("SlashMenu mouse vs keyboard scroll", () => {
	it("does NOT call scrollIntoView when the mouse hovers a different row", () => {
		const { scrollSpy, getAllByRole } = setup();
		const baseline = scrollSpy.mock.calls.length;
		// Mouse-hover a non-active row. The component updates activeIndex
		// from `onMouseEnter`, but the effect must NOT scroll.
		const rows = getAllByRole("option");
		fireEvent.mouseEnter(rows[2]);
		fireEvent.mouseEnter(rows[5]);
		expect(scrollSpy.mock.calls.length).toBe(baseline);
		scrollSpy.mockRestore();
	});

	it("DOES call scrollIntoView when ArrowDown moves the highlight", () => {
		const { scrollSpy } = setup();
		const baseline = scrollSpy.mock.calls.length;
		fireEvent.keyDown(window, { key: "ArrowDown" });
		expect(scrollSpy.mock.calls.length).toBeGreaterThan(baseline);
		scrollSpy.mockRestore();
	});
});
