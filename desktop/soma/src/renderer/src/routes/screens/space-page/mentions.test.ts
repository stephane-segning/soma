import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the service layer so the provider's `items` function runs without IPC.
// ---------------------------------------------------------------------------

const mockListSpaceBots = vi.fn();
const mockListSpaceMembers = vi.fn();
const mockListSpaces = vi.fn();
const mockListPages = vi.fn();

vi.mock("../../../services/spaces-service", () => ({
	listSpaceBots: (...args: unknown[]) => mockListSpaceBots(...args),
	listSpaceMembers: (...args: unknown[]) => mockListSpaceMembers(...args),
	listSpaces: (...args: unknown[]) => mockListSpaces(...args),
}));

vi.mock("../../../services/documents-service", () => ({
	listPages: (...args: unknown[]) => mockListPages(...args),
}));

import { usePageMentionProviders } from "./mentions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProvider(providers: ReturnType<typeof usePageMentionProviders>, name: string) {
	const p = providers.find((p) => p.name === name);
	if (!p) throw new Error(`Provider "${name}" not found`);
	return p;
}

// ---------------------------------------------------------------------------
// Bot mention provider tests
// ---------------------------------------------------------------------------

describe("botMention provider", () => {
	beforeEach(() => {
		mockListSpaceBots.mockReset();
		mockListSpaceMembers.mockResolvedValue([]);
		mockListSpaces.mockResolvedValue({ spaces: [] });
		mockListPages.mockResolvedValue([]);
	});

	it("is registered with trigger char '!' and section 'bots'", () => {
		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const bot = getProvider(result.current, "botMention");
		expect(bot.char).toBe("!");
		expect(bot.section).toBe("bots");
	});

	it("returns all four providers", () => {
		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const names = result.current.map((p) => p.name);
		expect(names).toContain("peerMention");
		expect(names).toContain("spaceMention");
		expect(names).toContain("pageMention");
		expect(names).toContain("botMention");
	});

	it("maps alias to label and last-6-chars-lowercased of peerId to detail", async () => {
		mockListSpaceBots.mockResolvedValue([
			{
				peerId: "12D3KooWScribe1",
				alias: "scribe",
				expiresAt: 0,
				spaceId: "space-1",
				status: "active",
				scopes: [],
			},
		]);

		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const bot = getProvider(result.current, "botMention");
		const items = await bot.items("");

		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			id: "12D3KooWScribe1",
			label: "scribe",
			// Matches `toBot()` in use-space-bots.ts: last 6 chars, lowercased.
			detail: "cribe1",
			href: "/spaces/space-1/settings?tab=bots&peerId=12D3KooWScribe1",
		});
	});

	it("synthesises a label from peerSuffix when alias is null", async () => {
		mockListSpaceBots.mockResolvedValue([
			{
				peerId: "12D3KooWABC12345",
				alias: null,
				expiresAt: 0,
				spaceId: "space-1",
				status: "pending",
				scopes: [],
			},
		]);

		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const bot = getProvider(result.current, "botMention");
		const items = await bot.items("");

		expect(items[0].label).toBe("bot-c12345");
		expect(items[0].detail).toBe("c12345");
	});

	it("treats blank/whitespace alias as missing and falls back to bot-<suffix>", async () => {
		mockListSpaceBots.mockResolvedValue([
			{
				peerId: "12D3KooWBlankAlias1",
				alias: "   ",
				expiresAt: 0,
				spaceId: "space-1",
				status: "active",
				scopes: [],
			},
			{
				peerId: "12D3KooWEmptyAlias2",
				alias: "",
				expiresAt: 0,
				spaceId: "space-1",
				status: "active",
				scopes: [],
			},
		]);

		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const bot = getProvider(result.current, "botMention");
		const items = await bot.items("");

		expect(items[0].label).toBe("bot-alias1");
		expect(items[1].label).toBe("bot-alias2");
	});

	it("filters by alias substring (case-insensitive)", async () => {
		mockListSpaceBots.mockResolvedValue([
			{ peerId: "peer1111", alias: "scribe", expiresAt: 0, spaceId: "space-1", status: "active", scopes: [] },
			{ peerId: "peer2222", alias: "reviewer", expiresAt: 0, spaceId: "space-1", status: "active", scopes: [] },
			{ peerId: "peer3333", alias: "Scribe-v2", expiresAt: 0, spaceId: "space-1", status: "active", scopes: [] },
		]);

		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const bot = getProvider(result.current, "botMention");
		const items = await bot.items("scri");

		expect(items.map((i) => i.label)).toEqual(["scribe", "Scribe-v2"]);
	});

	it("filters by peerSuffix when bot has no alias", async () => {
		mockListSpaceBots.mockResolvedValue([
			{ peerId: "12D3KooWXXXABCDE", alias: null, expiresAt: 0, spaceId: "space-1", status: "active", scopes: [] },
			{ peerId: "12D3KooWXXX99999", alias: null, expiresAt: 0, spaceId: "space-1", status: "active", scopes: [] },
		]);

		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const bot = getProvider(result.current, "botMention");
		const items = await bot.items("ABCDE");

		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("12D3KooWXXXABCDE");
	});

	it("returns empty list when spaceId bots list is empty", async () => {
		mockListSpaceBots.mockResolvedValue([]);

		const { result } = renderHook(() => usePageMentionProviders("space-1"));
		const bot = getProvider(result.current, "botMention");
		const items = await bot.items("");

		expect(items).toEqual([]);
	});

	it("calls listSpaceBots with the spaceId from the hook", async () => {
		mockListSpaceBots.mockResolvedValue([]);

		const { result } = renderHook(() => usePageMentionProviders("my-space-42"));
		const bot = getProvider(result.current, "botMention");
		await bot.items("any");

		expect(mockListSpaceBots).toHaveBeenCalledWith("my-space-42");
	});
});
