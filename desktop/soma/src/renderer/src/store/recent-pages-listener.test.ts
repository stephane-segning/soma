import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	recentPagesActions,
	recentPagesReducer,
	STORAGE_KEY,
} from "./recent-pages";
import { recentPagesListenerMiddleware } from "./recent-pages-listener";

function makeStore() {
	return configureStore({
		reducer: { recentPages: recentPagesReducer },
		middleware: (getDefault) =>
			getDefault().prepend(recentPagesListenerMiddleware.middleware),
	});
}

describe("recentPagesListenerMiddleware", () => {
	let setItemSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		localStorage.clear();
		setItemSpy = vi.spyOn(Storage.prototype, "setItem");
	});

	afterEach(() => {
		setItemSpy.mockRestore();
	});

	it("persists the entries to localStorage after recordPageOpened", () => {
		const store = makeStore();
		store.dispatch(
			recentPagesActions.recordPageOpened({
				spaceId: "s1",
				pageId: "p1",
				title: "Page 1",
				openedAt: 1234,
			}),
		);
		const raw = localStorage.getItem(STORAGE_KEY);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw ?? "[]") as Array<{ pageId: string; openedAt: number }>;
		expect(parsed).toHaveLength(1);
		expect(parsed[0].pageId).toBe("p1");
		expect(parsed[0].openedAt).toBe(1234);
	});

	it("swallows localStorage write failures (e.g. quota exceeded)", () => {
		setItemSpy.mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});
		const store = makeStore();
		expect(() =>
			store.dispatch(
				recentPagesActions.recordPageOpened({
					spaceId: "s1",
					pageId: "p1",
					title: "Page 1",
					openedAt: 1,
				}),
			),
		).not.toThrow();
		// In-memory state is still updated even if persistence failed.
		expect(store.getState().recentPages.entries).toHaveLength(1);
	});
});
