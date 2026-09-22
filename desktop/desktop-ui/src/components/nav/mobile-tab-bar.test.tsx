import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import { MobileTabBar, type MobileTabBarItem } from "./mobile-tab-bar";

const ITEMS: MobileTabBarItem[] = [
	{ id: "pages", icon: <span data-testid="icon-pages" />, label: "Pages" },
	{ id: "chat", icon: <span data-testid="icon-chat" />, label: "Chat" },
	{ id: "bots", icon: <span data-testid="icon-bots" />, label: "Bots" },
	{ id: "nav", icon: <span data-testid="icon-nav" />, label: "More" },
];

describe("MobileTabBar", () => {
	it("renders one labelled tab per item", () => {
		render(
			<SomaIntlProvider>
				<MobileTabBar items={ITEMS} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		for (const item of ITEMS) {
			expect(screen.getByText(item.label)).toBeTruthy();
		}
		expect(screen.getAllByRole("button")).toHaveLength(4);
	});

	it("marks the active tab with aria-current and none other", () => {
		render(
			<SomaIntlProvider>
				<MobileTabBar activeId="chat" items={ITEMS} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		const chatButton = screen.getByText("Chat").closest("button");
		expect(chatButton?.getAttribute("aria-current")).toBe("page");
		const pagesButton = screen.getByText("Pages").closest("button");
		expect(pagesButton?.hasAttribute("aria-current")).toBe(false);
	});

	it("has no active tab when activeId is null", () => {
		render(
			<SomaIntlProvider>
				<MobileTabBar activeId={null} items={ITEMS} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		for (const button of screen.getAllByRole("button")) {
			expect(button.hasAttribute("aria-current")).toBe(false);
		}
	});

	it("fires onSelect with the tapped tab's id, even when it's already active", () => {
		const onSelect = vi.fn();
		render(
			<SomaIntlProvider>
				<MobileTabBar activeId="pages" items={ITEMS} onSelect={onSelect} />
			</SomaIntlProvider>,
		);
		fireEvent.click(screen.getByText("Pages"));
		expect(onSelect).toHaveBeenCalledWith("pages");
		fireEvent.click(screen.getByText("Chat"));
		expect(onSelect).toHaveBeenCalledWith("chat");
	});

	it("renders nothing when items is empty", () => {
		const { container } = render(
			<SomaIntlProvider>
				<MobileTabBar items={[]} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		expect(container.querySelector("nav")).toBeNull();
	});
});
