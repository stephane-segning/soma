import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const isLoading = { value: false };
type FakeBotRow = {
	spaceId: string;
	peerId: string;
	expiresAt: number;
	alias: string | null;
	status: "pending" | "active" | "failed" | "expired";
	scopes?: string[];
};

const listQueryState: {
	data: FakeBotRow[];
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
	useIssueIssuerCapabilityMutation: () => ({
		mutate: vi.fn(),
		mutateAsync,
		isLoading: isLoading.value,
	}),
	useSpaceBotsQuery: () => listQueryState,
}));

import { useSpaceBots } from "./use-space-bots";

function resetListQuery() {
	listQueryState.data = [];
	listQueryState.isLoading = false;
	listQueryState.isFetching = false;
	listQueryState.error = null;
}

describe("useSpaceBots list view", () => {
	beforeEach(() => {
		resetListQuery();
		mutateAsync.mockReset();
		isLoading.value = false;
	});

	it("starts empty when the query has no rows", () => {
		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.bots).toEqual([]);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.loadError).toBeNull();
	});

	it("uses the operator-typed alias when the daemon row carries one", () => {
		listQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWAbcdef",
				expiresAt: 0,
				alias: "scribe",
				status: "active",
			},
		];

		const { result } = renderHook(() => useSpaceBots("space_1"));

		expect(result.current.bots).toEqual([
			{
				id: "12D3KooWAbcdef",
				alias: "scribe",
				peerId: "12D3KooWAbcdef",
				status: "active",
			},
		]);
	});

	it("falls back to a peer-id-derived alias when the daemon row has a null alias (legacy rows)", () => {
		listQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWAbcdef",
				expiresAt: 0,
				alias: null,
				status: "active",
			},
			{
				spaceId: "space_1",
				peerId: "12D3KooWzZ1234",
				expiresAt: 0,
				alias: "   ", // whitespace-only counts as missing
				status: "active",
			},
		];

		const { result } = renderHook(() => useSpaceBots("space_1"));

		expect(result.current.bots).toEqual([
			{
				id: "12D3KooWAbcdef",
				alias: "bot-abcdef",
				peerId: "12D3KooWAbcdef",
				status: "active",
			},
			{
				id: "12D3KooWzZ1234",
				alias: "bot-zz1234",
				peerId: "12D3KooWzZ1234",
				status: "active",
			},
		]);
	});

	it("client-side override flips stale 'active' rows to 'expired' when the wall clock has moved past expiresAt", () => {
		// Snapshot in RTK still says `active` (Bots tab opened before the
		// 60-second TTL elapsed). 5 seconds ago in epoch seconds:
		const fiveSecondsAgo = Math.floor((Date.now() - 5_000) / 1000);
		listQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWStaleBot",
				expiresAt: fiveSecondsAgo,
				alias: "stale",
				status: "active",
			},
		];

		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.bots[0].status).toBe("expired");
	});

	it("client-side override is a no-op for active bots with future expiry", () => {
		const oneHourFromNow = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		listQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWFreshBot",
				expiresAt: oneHourFromNow,
				alias: "fresh",
				status: "active",
			},
		];

		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.bots[0].status).toBe("active");
	});

	it("client-side override is a no-op for the no-expiry sentinel (expiresAt=0)", () => {
		listQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWPermBot",
				expiresAt: 0,
				alias: "permanent",
				status: "active",
			},
		];

		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.bots[0].status).toBe("active");
	});

	it("client-side override does not touch pending or failed rows (the handshake protocol owns those)", () => {
		const fiveSecondsAgo = Math.floor((Date.now() - 5_000) / 1000);
		listQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWPendingBot",
				expiresAt: fiveSecondsAgo,
				alias: "handshaking",
				status: "pending",
			},
			{
				spaceId: "space_1",
				peerId: "12D3KooWFailedBot",
				expiresAt: fiveSecondsAgo,
				alias: "rejected",
				status: "failed",
			},
		];

		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.bots.map((b) => b.status)).toEqual([
			"pending",
			"failed",
		]);
	});

	it("forwards daemon-side status states (expired/pending/failed) to the @soma/ui Bot rows", () => {
		listQueryState.data = [
			{
				spaceId: "space_1",
				peerId: "12D3KooWExpiredBot",
				expiresAt: 1,
				alias: "stale",
				status: "expired",
			},
			{
				spaceId: "space_1",
				peerId: "12D3KooWPendingBot",
				expiresAt: 0,
				alias: "handshaking",
				status: "pending",
			},
			{
				spaceId: "space_1",
				peerId: "12D3KooWFailedBot",
				expiresAt: 0,
				alias: "rejected",
				status: "failed",
			},
		];

		const { result } = renderHook(() => useSpaceBots("space_1"));

		expect(result.current.bots.map((b) => b.status)).toEqual([
			"expired",
			"pending",
			"failed",
		]);
	});

	it("surfaces isLoading while the underlying query is in flight", () => {
		listQueryState.isLoading = true;
		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.isLoading).toBe(true);
	});

	it("surfaces isFetching for revalidation as isLoading too", () => {
		listQueryState.isFetching = true;
		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.isLoading).toBe(true);
	});

	it("surfaces query errors via loadError", () => {
		listQueryState.error = new Error("daemon offline");
		const { result } = renderHook(() => useSpaceBots("space_1"));
		expect(result.current.loadError).toMatch(/daemon offline/);
	});
});

describe("useSpaceBots.addBot", () => {
	beforeEach(() => {
		resetListQuery();
		mutateAsync.mockReset();
		isLoading.value = false;
	});

	it("rejects when no space is selected", async () => {
		const { result } = renderHook(() => useSpaceBots(undefined));

		await expect(
			result.current.addBot({
				peerId: "12D3KooW",
				alias: "",
				scopeIds: [],
				expiryDate: null,
			}),
		).rejects.toThrow(/No space is selected/);

		expect(mutateAsync).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(result.current.addError).toMatch(/No space is selected/);
		});
	});

	it("forwards spaceId, peerId, expiresAt=0, trimmed alias, and scopeIds for the Never toggle", async () => {
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await act(async () => {
			await result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "  scribe  ",
				scopeIds: ["scope_a"],
				expiryDate: null,
			});
		});

		expect(mutateAsync).toHaveBeenCalledWith({
			spaceId: "space_1",
			targetPeerId: "12D3KooWPeer",
			expiresAt: 0,
			alias: "scribe",
			scopes: ["scope_a"],
		});
	});

	it("sends alias=null when the form leaves the alias blank", async () => {
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await act(async () => {
			await result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "   ",
				scopeIds: [],
				expiryDate: null,
			});
		});

		expect(mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ alias: null }),
		);
	});

	it("forwards scopeIds from the Add form as the scopes array", async () => {
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await act(async () => {
			await result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "bot",
				scopeIds: ["spaces:read", "spaces:write"],
				expiryDate: null,
			});
		});

		expect(mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ scopes: ["spaces:read", "spaces:write"] }),
		);
	});

	it("forwards empty scopeIds as an empty scopes array", async () => {
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await act(async () => {
			await result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "",
				scopeIds: [],
				expiryDate: null,
			});
		});

		expect(mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ scopes: [] }),
		);
	});

	it("converts ISO expiryDate strings to epoch-ms before forwarding", async () => {
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		const future = "2099-01-01T00:00:00Z";
		const expected = Date.parse(future);

		await act(async () => {
			await result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "",
				scopeIds: [],
				expiryDate: future,
			});
		});

		expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: expected }));
	});

	it("rejects past expiry dates without invoking the mutation", async () => {
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await expect(
			result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "",
				scopeIds: [],
				expiryDate: "1970-01-01T00:00:00Z",
			}),
		).rejects.toThrow(/valid date in the future/);

		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("rejects unparseable expiry dates without invoking the mutation", async () => {
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await expect(
			result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "",
				scopeIds: [],
				expiryDate: "not-a-date",
			}),
		).rejects.toThrow(/valid date in the future/);

		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("surfaces mutation rejection in addError", async () => {
		mutateAsync.mockRejectedValue(new Error("daemon rejected"));
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await expect(
			result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "",
				scopeIds: [],
				expiryDate: null,
			}),
		).rejects.toThrow(/daemon rejected/);

		await waitFor(() => {
			expect(result.current.addError).toMatch(/daemon rejected/);
		});
	});

	it("clearAddError resets the surfaced error", async () => {
		const { result } = renderHook(() => useSpaceBots(undefined));

		await expect(
			result.current.addBot({
				peerId: "12D3KooW",
				alias: "",
				scopeIds: [],
				expiryDate: null,
			}),
		).rejects.toThrow();

		await waitFor(() => {
			expect(result.current.addError).not.toBeNull();
		});

		act(() => {
			result.current.clearAddError();
		});

		expect(result.current.addError).toBeNull();
	});
});

describe("useSpaceBots.retryBot", () => {
	const failedRow: FakeBotRow = {
		spaceId: "space_1",
		peerId: "12D3KooWFailedBot",
		expiresAt: 0,
		alias: "rejected",
		status: "failed",
	};

	beforeEach(() => {
		resetListQuery();
		mutateAsync.mockReset();
		isLoading.value = false;
	});

	it("calls mutateAsync with the bot's peerId, trimmed alias, and expiresAt=0", async () => {
		listQueryState.data = [failedRow];
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await act(async () => {
			await result.current.retryBot(result.current.bots[0]);
		});

		expect(mutateAsync).toHaveBeenCalledWith({
			spaceId: "space_1",
			targetPeerId: "12D3KooWFailedBot",
			expiresAt: 0,
			alias: "rejected",
		});
	});

	it("sends alias=null when the daemon row has no alias (avoids promoting the UI fallback)", async () => {
		// Daemon stored no alias for this row, so `toBot` synthesises a
		// `bot-<suffix>` UI fallback. Retry must NOT persist that fallback —
		// it should look the row up by peerId and forward the true null.
		listQueryState.data = [{ ...failedRow, alias: null }];
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		// Sanity-check that the UI mapping did inject the fallback alias.
		expect(result.current.bots[0]?.alias).toMatch(/^bot-/);

		await act(async () => {
			await result.current.retryBot(result.current.bots[0]);
		});

		expect(mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ alias: null }),
		);
	});

	it("sends alias=null when the daemon row alias is whitespace-only", async () => {
		listQueryState.data = [{ ...failedRow, alias: "   " }];
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await act(async () => {
			await result.current.retryBot(result.current.bots[0]);
		});

		expect(mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ alias: null }),
		);
	});

	it("surfaces a generic errorReason on failed rows so the Retry button renders", () => {
		listQueryState.data = [failedRow];
		const { result } = renderHook(() => useSpaceBots("space_1"));

		expect(result.current.bots[0]?.errorReason).toBeTruthy();
	});

	it("does not attach an errorReason to non-failed rows", () => {
		listQueryState.data = [{ ...failedRow, status: "active" }];
		const { result } = renderHook(() => useSpaceBots("space_1"));

		expect(result.current.bots[0]?.errorReason).toBeUndefined();
	});

	it("rejects and surfaces addError when no space is selected", async () => {
		const stubBot = {
			id: "12D3KooWFailedBot",
			alias: "rejected",
			peerId: "12D3KooWFailedBot",
			status: "failed" as const,
		};
		const { result } = renderHook(() => useSpaceBots(undefined));

		await expect(result.current.retryBot(stubBot)).rejects.toThrow(
			/No space is selected/,
		);

		await waitFor(() => {
			expect(result.current.addError).toMatch(/No space is selected/);
		});

		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("surfaces mutation rejection in addError", async () => {
		listQueryState.data = [failedRow];
		mutateAsync.mockRejectedValue(new Error("handshake timeout"));
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await expect(
			result.current.retryBot(result.current.bots[0]),
		).rejects.toThrow(/handshake timeout/);

		await waitFor(() => {
			expect(result.current.addError).toMatch(/handshake timeout/);
		});
	});
});
