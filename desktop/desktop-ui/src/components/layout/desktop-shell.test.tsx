/**
 * DesktopShell tier-dependent chrome — the ADR-0005 §2 deviation at
 * the "verySmall" tier (see `leftGutter`'s / `mobileNav`'s doc
 * comments on the component itself): the spaces gutter hides, and a
 * `mobileNav` slot appears in its place. "comfortable"/"tight" must
 * stay exactly as before.
 *
 * `useShellTier` measures via `ResizeObserver`, which jsdom doesn't
 * implement — with it `undefined`, the hook's effect bails out and
 * the tier stays at its synchronous mount-time guess from
 * `window.innerWidth` (see that hook's doc comment). Setting
 * `innerWidth` before each render is therefore enough to pin a tier
 * for these tests without a ResizeObserver polyfill.
 */
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import { DesktopShell } from "./desktop-shell";

function setViewportWidth(width: number) {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		writable: true,
		value: width,
	});
}

function renderShell(
	width: number,
	extraProps: Partial<ComponentProps<typeof DesktopShell>> = {},
) {
	setViewportWidth(width);
	return render(
		<SomaIntlProvider>
			<DesktopShell
				leftGutter={<div data-testid="spaces-gutter">gutter</div>}
				mobileNav={<div data-testid="mobile-nav">tab bar</div>}
				{...extraProps}
			>
				<div>editor</div>
			</DesktopShell>
		</SomaIntlProvider>,
	);
}

describe("DesktopShell tier-dependent chrome", () => {
	it("docks the spaces gutter at the comfortable tier (>= 1280px)", () => {
		renderShell(1400);
		expect(screen.getByTestId("spaces-gutter")).toBeTruthy();
	});

	it("docks the spaces gutter at the tight tier (960-1280px)", () => {
		renderShell(1000);
		expect(screen.getByTestId("spaces-gutter")).toBeTruthy();
	});

	it("hides the spaces gutter at the verySmall tier (< 960px)", () => {
		renderShell(500);
		expect(screen.queryByTestId("spaces-gutter")).toBeNull();
	});

	it("does not render mobileNav at the comfortable tier", () => {
		renderShell(1400);
		expect(screen.queryByTestId("mobile-nav")).toBeNull();
	});

	it("does not render mobileNav at the tight tier", () => {
		renderShell(1000);
		expect(screen.queryByTestId("mobile-nav")).toBeNull();
	});

	it("renders mobileNav at the verySmall tier", () => {
		renderShell(500);
		expect(screen.getByTestId("mobile-nav")).toBeTruthy();
	});

	it("reports the verySmall tier via onTierChange, including on mount", () => {
		const onTierChange = vi.fn();
		renderShell(500, { onTierChange });
		expect(onTierChange).toHaveBeenCalledWith("verySmall");
	});

	it("reports the comfortable tier via onTierChange, including on mount", () => {
		const onTierChange = vi.fn();
		renderShell(1400, { onTierChange });
		expect(onTierChange).toHaveBeenCalledWith("comfortable");
	});

	it("reports the tight tier via onTierChange, including on mount", () => {
		const onTierChange = vi.fn();
		renderShell(1000, { onTierChange });
		expect(onTierChange).toHaveBeenCalledWith("tight");
	});
});
