import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("../lib/ipc", () => ({
	invoke,
}));

describe("spaces service", () => {
	beforeEach(() => {
		vi.resetModules();
		invoke.mockReset();
	});

	it("forwards list queries to IPC with the expected payload shape", async () => {
		invoke.mockResolvedValue({ spaces: [], limit: 20, offset: 0 });
		const service = await import("./spaces-service");

		await service.listSpaces({ limit: 20, offset: 0, query: "notes" });

		expect(invoke).toHaveBeenCalledWith("spaces_list", {
			limit: 20,
			offset: 0,
			q: "notes",
		});
	});

	it("returns an empty membership list when IPC fails", async () => {
		invoke.mockRejectedValue(new Error("failed"));
		const service = await import("./spaces-service");

		await expect(service.listSpaceMembers("space_1")).resolves.toEqual([]);
	});

	it("returns false when revoking a membership fails", async () => {
		invoke.mockRejectedValue(new Error("failed"));
		const service = await import("./spaces-service");

		await expect(service.revokeMembership({ spaceId: "space_1", subjectPeerId: "peer_1" })).resolves.toBe(false);
	});

	it("forwards issueIssuerCapability arguments to IPC unchanged (boundary is daemon-client, not service)", async () => {
		invoke.mockResolvedValue(true);
		const service = await import("./spaces-service");

		await service.issueIssuerCapability({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 1_700_000_000_000,
		});

		expect(invoke).toHaveBeenCalledWith("spaces_issue_issuer_capability", {
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 1_700_000_000_000,
		});
	});

	it("passes 0 through as the daemon's no-expiry sentinel", async () => {
		invoke.mockResolvedValue(true);
		const service = await import("./spaces-service");

		await service.issueIssuerCapability({
			spaceId: "space_1",
			targetPeerId: "peer_1",
			expiresAt: 0,
		});

		expect(invoke).toHaveBeenCalledWith("spaces_issue_issuer_capability", expect.objectContaining({ expiresAt: 0 }));
	});
});
