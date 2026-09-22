import { describe, expect, it } from "vitest";
import { activeMobileTabId, dismissMobileTab, selectMobileTab } from "./mobile-nav";

describe("activeMobileTabId", () => {
	it("returns null when nothing is expanded", () => {
		expect(activeMobileTabId(new Set(), new Set())).toBeNull();
	});

	it("returns the left side's id when only left is expanded", () => {
		expect(activeMobileTabId(new Set(["pages"]), new Set())).toBe("pages");
	});

	it("returns the right side's id when only right is expanded", () => {
		expect(activeMobileTabId(new Set(), new Set(["chat"]))).toBe("chat");
	});

	it("prefers left when both sides somehow carry an id", () => {
		expect(activeMobileTabId(new Set(["nav"]), new Set(["bots"]))).toBe("nav");
	});
});

describe("selectMobileTab", () => {
	it("opens a left-side tab exclusively, from the editor showing", () => {
		const next = selectMobileTab(null, { side: "left", id: "pages" });
		expect(next).toEqual({
			left: new Set(["pages"]),
			right: new Set(),
			activeId: "pages",
		});
	});

	it("opens a right-side tab exclusively, from the editor showing", () => {
		const next = selectMobileTab(null, { side: "right", id: "chat" });
		expect(next).toEqual({
			left: new Set(),
			right: new Set(["chat"]),
			activeId: "chat",
		});
	});

	it("switching from a left tab to a right tab clears the left side", () => {
		const next = selectMobileTab("pages", { side: "right", id: "bots" });
		expect(next).toEqual({
			left: new Set(),
			right: new Set(["bots"]),
			activeId: "bots",
		});
	});

	it("switching from a right tab to a left tab clears the right side", () => {
		const next = selectMobileTab("chat", { side: "left", id: "nav" });
		expect(next).toEqual({
			left: new Set(["nav"]),
			right: new Set(),
			activeId: "nav",
		});
	});

	it("switching between two tabs on the same side replaces the id", () => {
		const next = selectMobileTab("pages", { side: "left", id: "nav" });
		expect(next).toEqual({
			left: new Set(["nav"]),
			right: new Set(),
			activeId: "nav",
		});
	});

	it("re-tapping the active tab closes it and returns to the editor", () => {
		const next = selectMobileTab("pages", { side: "left", id: "pages" });
		expect(next).toEqual({ left: new Set(), right: new Set(), activeId: null });
	});
});

describe("dismissMobileTab", () => {
	it("always returns the empty/closed state", () => {
		expect(dismissMobileTab()).toEqual({
			left: new Set(),
			right: new Set(),
			activeId: null,
		});
	});
});
