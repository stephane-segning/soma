/**
 * Smoke render tests for the CommandPaletteShell renderer wrapper.
 *
 * The wrapper reads `isCommandPaletteOpen` from the Redux ui slice and feeds
 * items from `useSpacesQuery` + `useSearchQuery` into `@soma/ui`'s
 * CommandPalette. These tests verify the component mounts without throwing
 * in both closed and open states.
 *
 * References:
 *  - docs/src/architecture/prd/ui-revamp-v0-cutover-status.md §testing-gap
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SomaIntlProvider } from "@soma/ui/i18n";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uiReducer } from "@app/store/ui";

// --- Mock queries before the component is imported ---

const spacesQueryState: {
	data: { spaces: { spaceId: string; displayName: string }[] } | undefined;
	isLoading: boolean;
	error: unknown;
} = {
	data: { spaces: [] },
	isLoading: false,
	error: null,
};

const searchQueryState: {
	data: { id: string; title: string; subtitle?: string }[] | undefined;
	isLoading: boolean;
	error: unknown;
} = {
	data: [],
	isLoading: false,
	error: null,
};

vi.mock("@app/queries/spaces", () => ({
	useSpacesQuery: () => spacesQueryState,
}));

vi.mock("@app/queries/search", () => ({
	useSearchQuery: () => searchQueryState,
}));

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (_key: string, fallback: string) => fallback,
	}),
}));

import { CommandPaletteShell } from "./command-palette";

function makeStore(uiOverride?: { isCommandPaletteOpen: boolean }) {
	return configureStore({
		reducer: {
			ui: uiReducer,
			recentPages: (state = { entries: [] }) => state,
		},
		preloadedState: uiOverride ? { ui: uiOverride } : undefined,
	});
}

function Wrapper({ isOpen = false }: { isOpen?: boolean }) {
	return (
		<Provider store={makeStore({ isCommandPaletteOpen: isOpen })}>
			<SomaIntlProvider>
				<MemoryRouter>
					<CommandPaletteShell />
				</MemoryRouter>
			</SomaIntlProvider>
		</Provider>
	);
}

describe("CommandPaletteShell (renderer wrapper) — smoke render", () => {
	beforeEach(() => {
		spacesQueryState.data = { spaces: [] };
		spacesQueryState.isLoading = false;
		spacesQueryState.error = null;
		searchQueryState.data = [];
		searchQueryState.isLoading = false;
		searchQueryState.error = null;
	});

	it("mounts without throwing when the palette is closed", () => {
		// When closed, the @soma/ui CommandPalette renders nothing visible
		render(<Wrapper isOpen={false} />);
		// No dialog should be visible
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("renders the command palette dialog when isOpen=true", () => {
		render(<Wrapper isOpen={true} />);
		expect(screen.getByRole("dialog", { name: /command palette/i })).toBeTruthy();
	});

	it("renders search input when open", () => {
		render(<Wrapper isOpen={true} />);
		expect(screen.getByRole("textbox")).toBeTruthy();
	});

	it("renders command items in the palette when open", () => {
		spacesQueryState.data = {
			spaces: [{ spaceId: "space_1", displayName: "My Space" }],
		};
		render(<Wrapper isOpen={true} />);
		// The "Create or join space" command is always present
		expect(
			screen.getByRole("option", { name: /create or join space/i }),
		).toBeTruthy();
		// The space item should be present
		expect(screen.getByRole("option", { name: /my space/i })).toBeTruthy();
	});

	it("renders built-in commands even when spaces/search are empty", () => {
		// With empty spaces + search data, the three built-in commands
		// (Create or join space, Settings, Project site) must still render —
		// they are hard-coded in the wrapper's items memo.
		render(<Wrapper isOpen={true} />);
		expect(
			screen.getByRole("option", { name: /create or join space/i }),
		).toBeTruthy();
		expect(screen.getByRole("option", { name: /settings/i })).toBeTruthy();
		expect(screen.getByRole("option", { name: /project site/i })).toBeTruthy();
	});
});
