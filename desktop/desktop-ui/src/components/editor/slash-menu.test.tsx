/**
 * Regression test for SlashMenu's keyboard scroll-into-view behaviour.
 *
 * Before the fix, ArrowDown / ArrowUp updated the highlighted option's
 * `aria-selected` but did not scroll the option into view inside the
 * `max-h-80 overflow-y-auto` container. When the user typed `/` over
 * an empty paragraph and tried to navigate past the visible window,
 * the highlight moved off-screen with no indication.
 *
 * This test pins the fix: pressing ArrowDown invokes `scrollIntoView`
 * on the newly active row.
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

describe("SlashMenu keyboard scroll", () => {
	it("calls scrollIntoView on the active row when ArrowDown moves the highlight", () => {
		// jsdom doesn't ship `scrollIntoView` — patch a no-op stub on the
		// prototype before spying so the spy has something to wrap.
		// biome-ignore lint/suspicious/noExplicitAny: typed stub for jsdom prototype hole
		(Element.prototype as any).scrollIntoView ??= () => {};
		const scrollSpy = vi
			.spyOn(Element.prototype, "scrollIntoView")
			.mockImplementation(() => {});

		const onClose = vi.fn();
		render(
			<SomaIntlProvider>
				<SlashMenu
					captureScope="window"
					items={makeItems(15)}
					onClose={onClose}
					query=""
				/>
			</SomaIntlProvider>,
		);

		// The mount-time effect scrolls the initial active row (index 0) into
		// view. We assert that ArrowDown produces *additional* scroll calls
		// rather than relying on a specific baseline count, since the initial
		// effect timing is an implementation detail.
		const baseline = scrollSpy.mock.calls.length;

		fireEvent.keyDown(window, { key: "ArrowDown" });
		fireEvent.keyDown(window, { key: "ArrowDown" });
		fireEvent.keyDown(window, { key: "ArrowDown" });

		expect(scrollSpy.mock.calls.length).toBeGreaterThan(baseline);
		// Every scroll call passes block: "nearest" so we don't jump when the
		// row is already visible.
		for (const call of scrollSpy.mock.calls.slice(baseline)) {
			expect(call[0]).toMatchObject({ block: "nearest" });
		}

		scrollSpy.mockRestore();
	});
});
