import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const isLoading = { value: false };
const listQueryState: {
	data: Array<{ peerId: string; expiresAt: number }>;
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

	it("maps daemon member rows onto the @soma/ui Bot shape (peerId + placeholder alias + active status)", () => {
		listQueryState.data = [
			{ peerId: "12D3KooWAbcdef", expiresAt: 0 },
			{ peerId: "12D3KooWzZ1234", expiresAt: 0 },
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

	it("passes 0 through when the form's Never toggle leaves expiryDate null", async () => {
		mutateAsync.mockResolvedValue(undefined);
		const { result } = renderHook(() => useSpaceBots("space_1"));

		await act(async () => {
			await result.current.addBot({
				peerId: "12D3KooWPeer",
				alias: "scribe",
				scopeIds: ["scope_a"],
				expiryDate: null,
			});
		});

		expect(mutateAsync).toHaveBeenCalledWith({
			spaceId: "space_1",
			targetPeerId: "12D3KooWPeer",
			expiresAt: 0,
		});
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
