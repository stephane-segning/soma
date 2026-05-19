/**
 * Smoke render tests for the SpacesRail renderer wrapper.
 *
 * The wrapper maps `useSpacesQuery` rows onto `@soma/ui`'s SpacesRail and
 * wires navigation via React Router. These tests verify the component mounts
 * without throwing and renders key UI landmarks under realistic mock data.
 *
 * References:
 *  - docs/src/architecture/prd/ui-revamp-v0-cutover-status.md §testing-gap
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { SomaIntlProvider } from "@soma/ui/i18n";
import { describe, expect, it, vi } from "vitest";

// --- Mock @app/queries/spaces before the component is imported ---

const spacesQueryState: {
	data: { spaces: { spaceId: string; displayName: string }[] } | undefined;
	isLoading: boolean;
	error: unknown;
} = {
	data: { spaces: [] },
	isLoading: false,
	error: null,
};

vi.mock("@app/queries/spaces", () => ({
	useSpacesQuery: () => spacesQueryState,
}));

import { SpacesRail } from "./spaces-rail";

function Wrapper({ spaceId = "space_1" }: { spaceId?: string }) {
	return (
		<SomaIntlProvider>
			<MemoryRouter initialEntries={[`/spaces/${spaceId}/pages`]}>
				<Routes>
					<Route path="/spaces/:spaceId/pages" element={<SpacesRail />} />
				</Routes>
			</MemoryRouter>
		</SomaIntlProvider>
	);
}

describe("SpacesRail (renderer wrapper) — smoke render", () => {
	it("mounts without throwing when the spaces query returns no data", () => {
		spacesQueryState.data = { spaces: [] };
		render(<Wrapper />);
		// The @soma/ui SpacesRail renders a <nav> with aria-label="Spaces"
		expect(screen.getByRole("navigation", { name: /spaces/i })).toBeTruthy();
	});

	it("renders a rail icon for each space", () => {
		spacesQueryState.data = {
			spaces: [
				{ spaceId: "space_alpha", displayName: "Alpha Team" },
				{ spaceId: "space_beta", displayName: "Beta Squad" },
			],
		};
		render(<Wrapper spaceId="space_alpha" />);
		// Each space becomes a <button> with aria-label = displayName
		expect(screen.getByRole("button", { name: "Alpha Team" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Beta Squad" })).toBeTruthy();
	});

	it("renders a monogram from the display name", () => {
		spacesQueryState.data = {
			spaces: [{ spaceId: "space_mono", displayName: "Design System" }],
		};
		render(<Wrapper />);
		// "Design System" → "DS"
		expect(screen.getByText("DS")).toBeTruthy();
	});

	it("renders a Create space button", () => {
		spacesQueryState.data = { spaces: [] };
		render(<Wrapper />);
		expect(screen.getByRole("button", { name: /create space/i })).toBeTruthy();
	});

	it("marks the active space with aria-current=page", () => {
		spacesQueryState.data = {
			spaces: [
				{ spaceId: "space_1", displayName: "One" },
				{ spaceId: "space_2", displayName: "Two" },
			],
		};
		render(<Wrapper spaceId="space_1" />);
		const activeBtn = screen.getByRole("button", { name: "One" });
		expect(activeBtn.getAttribute("aria-current")).toBe("page");
		const inactiveBtn = screen.getByRole("button", { name: "Two" });
		expect(inactiveBtn.getAttribute("aria-current")).toBeNull();
	});
});
