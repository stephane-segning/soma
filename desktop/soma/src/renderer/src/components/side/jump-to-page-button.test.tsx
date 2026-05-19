/**
 * Smoke render tests for the JumpToPageButton renderer wrapper.
 *
 * The wrapper uses `usePagesQuery` and renders `@soma/ui`'s `TreePopover`
 * (via floating-ui) when clicked. These tests verify the component mounts
 * without throwing and renders the trigger button under realistic mock data.
 *
 * References:
 *  - docs/src/architecture/prd/ui-revamp-v0-cutover-status.md §testing-gap
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { SomaIntlProvider } from "@soma/ui/i18n";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock @app/queries/pages before the component is imported ---

const pagesQueryState: {
	data: { pageId: string; title: string; parentPageIds: string[] }[] | undefined;
	isLoading: boolean;
	error: unknown;
} = {
	data: [],
	isLoading: false,
	error: null,
};

vi.mock("@app/queries/pages", () => ({
	usePagesQuery: () => pagesQueryState,
}));

// Mock react-i18next — the wrapper calls useTranslation("common")
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (_key: string, fallback: string) => fallback,
	}),
}));

import { JumpToPageButton } from "./jump-to-page-button";

/** Minimal Redux store satisfying the tabs + recentPages slices. */
function makeStore() {
	return configureStore({
		reducer: {
			tabs: (state = { initialized: false, activeId: "", tabs: [] }) => state,
			recentPages: (state = { entries: [] }) => state,
		},
	});
}

function Wrapper({ spaceId = "space_1", pageId = "page_1" }: { spaceId?: string; pageId?: string }) {
	return (
		<Provider store={makeStore()}>
			<SomaIntlProvider>
				<MemoryRouter initialEntries={[`/spaces/${spaceId}/pages/${pageId}`]}>
					<Routes>
						<Route
							path="/spaces/:spaceId/pages/:pageId"
							element={<JumpToPageButton />}
						/>
					</Routes>
				</MemoryRouter>
			</SomaIntlProvider>
		</Provider>
	);
}

describe("JumpToPageButton (renderer wrapper) — smoke render", () => {
	beforeEach(() => {
		pagesQueryState.data = [];
		pagesQueryState.isLoading = false;
		pagesQueryState.error = null;
	});

	it("mounts without throwing when the pages query returns an empty list", () => {
		render(<Wrapper />);
		expect(screen.getByRole("button", { name: /jump to page/i })).toBeTruthy();
	});

	it("renders the trigger button with pages in the query", () => {
		pagesQueryState.data = [
			{ pageId: "page_a", title: "Getting started", parentPageIds: [] },
			{ pageId: "page_b", title: "Architecture", parentPageIds: ["page_a"] },
		];
		render(<Wrapper />);
		expect(screen.getByRole("button", { name: /jump to page/i })).toBeTruthy();
	});

	it("renders nothing when spaceId is absent from route params", () => {
		// Component returns null when spaceId is missing
		const { container } = render(
			<Provider store={makeStore()}>
				<SomaIntlProvider>
					<MemoryRouter initialEntries={["/"]}>
						<Routes>
							<Route path="/" element={<JumpToPageButton />} />
						</Routes>
					</MemoryRouter>
				</SomaIntlProvider>
			</Provider>,
		);
		// The component returns null — so nothing is rendered
		expect(container.firstChild).toBeNull();
	});
});
