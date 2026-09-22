import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SomaIntlProvider } from "../../i18n/intl-provider";
import { SpaceSwitcher } from "./space-switcher";
import type { SpaceRailItem } from "./spaces-rail";

const ITEMS: SpaceRailItem[] = [
	{ id: "s1", icon: "PE", name: "Personal" },
	{ id: "s2", icon: "MT", name: "My Team" },
];

describe("SpaceSwitcher", () => {
	it("shows the active space's display name, not its monogram", () => {
		render(
			<SomaIntlProvider>
				<SpaceSwitcher activeId="s2" items={ITEMS} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		expect(screen.getByText("My Team")).toBeTruthy();
		expect(screen.queryByText("MT")).toBeNull();
	});

	it("shows a placeholder when no space is active", () => {
		render(
			<SomaIntlProvider>
				<SpaceSwitcher activeId={null} items={ITEMS} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		expect(screen.getByText("Select a space")).toBeTruthy();
	});

	it("opens a sheet listing every space plus Create/Join on trigger tap", () => {
		render(
			<SomaIntlProvider>
				<SpaceSwitcher activeId="s1" items={ITEMS} onCreate={() => {}} onJoin={() => {}} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		expect(screen.queryByText("Create space")).toBeNull();

		fireEvent.click(screen.getByText("Personal"));

		expect(screen.getAllByText("Personal").length).toBeGreaterThan(0);
		expect(screen.getByText("My Team")).toBeTruthy();
		expect(screen.getByText("Create space")).toBeTruthy();
		expect(screen.getByText("Join a space")).toBeTruthy();
	});

	it("hides the Create/Join rows when their handlers are omitted", () => {
		render(
			<SomaIntlProvider>
				<SpaceSwitcher activeId="s1" items={ITEMS} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		fireEvent.click(screen.getByText("Personal"));
		expect(screen.queryByText("Create space")).toBeNull();
		expect(screen.queryByText("Join a space")).toBeNull();
	});

	it("selecting a space fires onSelect with its id and closes the sheet", () => {
		const onSelect = vi.fn();
		render(
			<SomaIntlProvider>
				<SpaceSwitcher activeId="s1" items={ITEMS} onSelect={onSelect} />
			</SomaIntlProvider>,
		);
		fireEvent.click(screen.getByText("Personal"));
		fireEvent.click(screen.getByText("My Team"));
		expect(onSelect).toHaveBeenCalledWith("s2");
		expect(screen.queryByText("Create space")).toBeNull();
	});

	it("fires onCreate when the Create space row is tapped", () => {
		const onCreate = vi.fn();
		render(
			<SomaIntlProvider>
				<SpaceSwitcher activeId="s1" items={ITEMS} onCreate={onCreate} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		fireEvent.click(screen.getByText("Personal"));
		fireEvent.click(screen.getByText("Create space"));
		expect(onCreate).toHaveBeenCalledTimes(1);
	});

	it("fires onJoin when the Join a space row is tapped", () => {
		const onJoin = vi.fn();
		render(
			<SomaIntlProvider>
				<SpaceSwitcher activeId="s1" items={ITEMS} onJoin={onJoin} onSelect={() => {}} />
			</SomaIntlProvider>,
		);
		fireEvent.click(screen.getByText("Personal"));
		fireEvent.click(screen.getByText("Join a space"));
		expect(onJoin).toHaveBeenCalledTimes(1);
	});
});
