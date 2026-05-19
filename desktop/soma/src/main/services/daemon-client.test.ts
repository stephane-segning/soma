import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddonRuntime } from "./addon-runtime";
import { DaemonClient } from "./daemon-client";

const issueIssuerCapability = vi.fn().mockResolvedValue(true);
const listSpaceBots = vi.fn().mockResolvedValue([]);

const fakeHandle = {
	issueIssuerCapability,
	listSpaceBots,
} as unknown as Awaited<ReturnType<AddonRuntime["start"]>>;

function makeClient() {
	const runtime = {
		start: vi.fn().mockResolvedValue(fakeHandle),
	} as unknown as AddonRuntime;
	return new DaemonClient(runtime);
}

describe("DaemonClient.issueIssuerCapability", () => {
	beforeEach(() => {
		issueIssuerCapability.mockReset();
		issueIssuerCapability.mockResolvedValue(true);
	});

	it("rejects empty spaceId / targetPeerId before reaching the addon", async () => {
		const client = makeClient();

		await expect(
			client.issueIssuerCapability({
				spaceId: "",
				targetPeerId: "peer_1",
				expiresAt: 0,
			}),
		).rejects.toThrow(/spaceId/);

		await expect(
			client.issueIssuerCapability({
				spaceId: "space_1",
				targetPeerId: " ",
				expiresAt: 0,
			}),
		).rejects.toThrow(/targetPeerId/);

		expect(issueIssuerCapability).not.toHaveBeenCalled();
	});

	it("rejects negative expiresAt", async () => {
		const client = makeClient();

		await expect(
			client.issueIssuerCapability({
				spaceId: "space_1",
				targetPeerId: "peer_1",
				expiresAt: -1,
			}),
		).rejects.toThrow(/non-negative epoch-ms/);
	});

	it("converts JS epoch-ms input into Rust-side epoch seconds", async () => {
		const client = makeClient();

		await client.issueIssuerCapability({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 1_700_000_000_000, // 2023-11-14T22:13:20Z
		});

		expect(issueIssuerCapability).toHaveBeenCalledWith({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 1_700_000_000,
		});
	});

	it("passes 0 through unconverted as the daemon's no-expiry sentinel", async () => {
		const client = makeClient();

		await client.issueIssuerCapability({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 0,
		});

		expect(issueIssuerCapability).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: 0 }));
	});

	it("trims whitespace from spaceId / targetPeerId", async () => {
		const client = makeClient();

		await client.issueIssuerCapability({
			spaceId: "  space_1  ",
			targetPeerId: "  peer_1  ",
			expiresAt: 0,
		});

		expect(issueIssuerCapability).toHaveBeenCalledWith({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 0,
		});
	});
});

describe("DaemonClient.listSpaceBots", () => {
	beforeEach(() => {
		listSpaceBots.mockReset();
		listSpaceBots.mockResolvedValue([]);
	});

	it("returns an empty list for blank spaceId without invoking the addon", async () => {
		const client = makeClient();

		await expect(client.listSpaceBots("")).resolves.toEqual([]);
		expect(listSpaceBots).not.toHaveBeenCalled();
	});

	it("forwards the spaceId to the napi handle and maps the result", async () => {
		listSpaceBots.mockResolvedValue([
			{
				spaceId: "space_1",
				peerId: "12D3KooWBot1",
				role: "bot",
				expiresAt: 0,
			},
			{
				spaceId: "space_1",
				peerId: "12D3KooWBot2",
				role: "bot",
				expiresAt: 1_700_000_000,
			},
		]);

		const client = makeClient();
		const bots = await client.listSpaceBots("space_1");

		expect(listSpaceBots).toHaveBeenCalledWith("space_1");
		expect(bots).toEqual([
			{
				spaceId: "space_1",
				peerId: "12D3KooWBot1",
				role: "bot",
				expiresAt: 0,
			},
			{
				spaceId: "space_1",
				peerId: "12D3KooWBot2",
				role: "bot",
				expiresAt: 1_700_000_000,
			},
		]);
	});

	it("tolerates a null/undefined response from the addon (maps to empty list)", async () => {
		listSpaceBots.mockResolvedValue(null as unknown as never);

		const client = makeClient();
		await expect(client.listSpaceBots("space_1")).resolves.toEqual([]);
	});
});
