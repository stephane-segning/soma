import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK-backed `backend` from `../lib/ipc`. Each method we touch
// gets its own `vi.fn()` so the asserts mirror the old `invoke(channel, ...)`
// shape — only now the boundary is the SDK call rather than the raw IPC
// channel name.
const spaces = {
	list: vi.fn(),
	create: vi.fn(),
	get: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
	members: vi.fn(),
	myMemberships: vi.fn(),
	bots: vi.fn(),
	join: vi.fn(),
	decideJoin: vi.fn(),
	joinRequests: vi.fn(),
	revokeMember: vi.fn(),
	issueIssuerCapability: vi.fn(),
};

vi.mock("../lib/ipc", () => ({
	backend: { spaces },
	invoke: vi.fn(),
}));

describe("spaces service", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const fn of Object.values(spaces)) fn.mockReset();
	});

	it("forwards list queries to backend.spaces.list with the expected payload shape", async () => {
		spaces.list.mockResolvedValue({ spaces: [], limit: 20, offset: 0 });
		const service = await import("./spaces-service");

		await service.listSpaces({ limit: 20, offset: 0, query: "notes" });

		expect(spaces.list).toHaveBeenCalledWith({ q: "notes", limit: 20, offset: 0 });
	});

	it("returns an empty membership list when the SDK rejects", async () => {
		spaces.members.mockRejectedValue(new Error("failed"));
		const service = await import("./spaces-service");

		await expect(service.listSpaceMembers("space_1")).resolves.toEqual([]);
	});

	it("returns false when revoking a membership fails", async () => {
		spaces.revokeMember.mockRejectedValue(new Error("failed"));
		const service = await import("./spaces-service");

		await expect(service.revokeMembership({ spaceId: "space_1", subjectPeerId: "peer_1" })).resolves.toBe(false);
	});

	it("forwards issueIssuerCapability arguments to the SDK unchanged", async () => {
		spaces.issueIssuerCapability.mockResolvedValue(true);
		const service = await import("./spaces-service");

		await service.issueIssuerCapability({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 1_700_000_000_000,
		});

		expect(spaces.issueIssuerCapability).toHaveBeenCalledWith({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 1_700_000_000_000,
		});
	});

	it("forwards listSpaceBots to backend.spaces.bots and returns SpaceBot rows", async () => {
		spaces.bots.mockResolvedValue([
			{ peerId: "12D3Koo1", expiresAt: 0, spaceId: "space_1", alias: "scribe", status: "active", scopes: [] },
		]);
		const service = await import("./spaces-service");

		const bots = await service.listSpaceBots("space_1");

		expect(spaces.bots).toHaveBeenCalledWith("space_1");
		expect(bots).toEqual([
			{ peerId: "12D3Koo1", expiresAt: 0, spaceId: "space_1", alias: "scribe", status: "active", scopes: [] },
		]);
	});

	it("returns an empty bot list when the spaceId is blank (no SDK call)", async () => {
		const service = await import("./spaces-service");

		await expect(service.listSpaceBots("")).resolves.toEqual([]);
		expect(spaces.bots).not.toHaveBeenCalled();
	});

	it("propagates SDK failures so the RTK Query wrapper can surface them as loadError", async () => {
		spaces.bots.mockRejectedValue(new Error("offline"));
		const service = await import("./spaces-service");

		await expect(service.listSpaceBots("space_1")).rejects.toThrow(/offline/);
	});

	it("passes 0 through as the daemon's no-expiry sentinel", async () => {
		spaces.issueIssuerCapability.mockResolvedValue(true);
		const service = await import("./spaces-service");

		await service.issueIssuerCapability({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 0,
		});

		expect(spaces.issueIssuerCapability).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: 0 }));
	});
});
