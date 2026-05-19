/**
 * Smoke render tests for the BotsTab component inside space settings.
 *
 * BotsTab wraps `@soma/ui`'s `BotList` (via `useSpaceBots`) and renders
 * the Bots settings tab. These tests verify the component mounts without
 * throwing and renders key UI elements under realistic mock data.
 *
 * References:
 *  - docs/src/architecture/prd/ui-revamp-v0-cutover-status.md §testing-gap
 */
import { render, screen } from "@testing-library/react";
import { SomaIntlProvider } from "@soma/ui/i18n";
import { describe, expect, it, vi } from "vitest";

// --- Mock @app/queries/spaces before the component is imported ---

const mutateAsync = vi.fn();

const spaceBotsQueryState: {
	data: {
		spaceId: string;
		peerId: string;
		expiresAt: number;
		alias: string | null;
		status: "pending" | "active" | "failed" | "expired";
	}[];
	isLoading: boolean;
	isFetching: boolean;
	error: unknown;
} = {
	data: [],
	isLoading: false,
	isFetching: false,
	error: null,
};

vi.mock("@app/queries/spaces", () => ({
	useSpaceBotsQuery: () => spaceBotsQueryState,
	useIssueIssuerCapabilityMutation: () => ({
		mutate: vi.fn(),
		mutateAsync,
		isLoading: false,
	}),
}));

// Mock react-i18next — BotsTab and AddBotPanel call useTranslation("common")
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (_key: string, fallback: string) => fallback,
	}),
}));

import { BotsTab } from "./bots-tab";

function Wrapper({ spaceId = "space_1" }: { spaceId?: string }) {
	return (
		<SomaIntlProvider>
			<BotsTab spaceId={spaceId} />
		</SomaIntlProvider>
	);
}

describe("BotsTab (renderer wrapper) — smoke render", () => {
	it("mounts without throwing when there are no bots", () => {
		spaceBotsQueryState.data = [];
		render(<Wrapper />);
		// Section heading is always rendered
		expect(screen.getByText("Bots")).toBeTruthy();
	});

	it("renders the empty state BotList with Add bot CTA", () => {
		spaceBotsQueryState.data = [];
		render(<Wrapper />);
		// @soma/ui BotList empty state renders "No bots in this space yet"
		expect(screen.getByText(/no bots in this space yet/i)).toBeTruthy();
		// The empty state Add bot CTA button
		expect(screen.getByRole("button", { name: /add bot/i })).toBeTruthy();
	});

	it("renders a bot row when the query returns an active bot", () => {
		spaceBotsQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWAbcdefghij123456",
				expiresAt: 0,
				alias: "scribe",
				status: "active",
			},
		];
		render(<Wrapper />);
		// The bot row renders @bot:<alias> via @soma/ui BotList
		expect(screen.getByText("@bot:scribe")).toBeTruthy();
	});

	it("renders the description paragraph", () => {
		spaceBotsQueryState.data = [];
		render(<Wrapper />);
		expect(
			screen.getByText(/bots are p2p peers granted scoped capabilities/i),
		).toBeTruthy();
	});

	it("renders the Add bot header button when bots exist", () => {
		spaceBotsQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWAbcdefghij123456",
				expiresAt: 0,
				alias: "helper",
				status: "active",
			},
		];
		render(<Wrapper />);
		// When bots are present the header Add bot button appears
		expect(screen.getByRole("button", { name: /add bot/i })).toBeTruthy();
	});
});
