import { describe, expect, it } from "vitest";
import { isMenuActionId, SHORTCUTS, shortcutFor, shortcutForMenuAction } from "./chords";

describe("SHORTCUTS table", () => {
	it("declares exactly one definition per id, with no duplicate chords", () => {
		const ids = SHORTCUTS.map((def) => def.id);
		expect(new Set(ids).size).toBe(ids.length);

		const chordKeys = SHORTCUTS.map(
			(def) => `${def.chord.key.toLowerCase()}|${def.chord.mod}|${Boolean(def.chord.shift)}`,
		);
		expect(new Set(chordKeys).size).toBe(chordKeys.length);
	});

	it("marks only open-palette and new-page as global; everything else is focus-aware", () => {
		const globalIds = SHORTCUTS.filter((def) => def.scope === "global").map((def) => def.id);
		expect(new Set(globalIds)).toEqual(new Set(["open-palette", "new-page"]));
	});
});

describe("shortcutFor", () => {
	it("returns the declared chord for every ShortcutId", () => {
		expect(shortcutFor("new-page").chord).toEqual({ key: "n", mod: true });
		expect(shortcutFor("new-space").chord).toEqual({ key: "n", mod: true, shift: true });
		expect(shortcutFor("toggle-spaces-rail").chord).toEqual({ key: "/", mod: true });
		expect(shortcutFor("toggle-chat-sidebar").chord).toEqual({ key: "/", mod: true, shift: true });
		expect(shortcutFor("open-palette").chord).toEqual({ key: "k", mod: true });
	});
});

describe("shortcutForMenuAction", () => {
	it("maps every native-menu id to its shortcut definition", () => {
		expect(shortcutForMenuAction("menu:new-page")?.id).toBe("new-page");
		expect(shortcutForMenuAction("menu:new-space")?.id).toBe("new-space");
		expect(shortcutForMenuAction("menu:toggle-spaces-rail")?.id).toBe("toggle-spaces-rail");
		expect(shortcutForMenuAction("menu:toggle-chat-sidebar")?.id).toBe("toggle-chat-sidebar");
	});
});

describe("isMenuActionId", () => {
	it("accepts every known menu action id", () => {
		expect(isMenuActionId("menu:new-page")).toBe(true);
		expect(isMenuActionId("menu:new-space")).toBe(true);
		expect(isMenuActionId("menu:toggle-spaces-rail")).toBe(true);
		expect(isMenuActionId("menu:toggle-chat-sidebar")).toBe(true);
	});

	it("rejects ids the renderer doesn't react to (handled Rust-side only) and unknown strings", () => {
		expect(isMenuActionId("menu:reload")).toBe(false);
		expect(isMenuActionId("menu:toggle-devtools")).toBe(false);
		expect(isMenuActionId("menu:help-docs")).toBe(false);
		expect(isMenuActionId("not-a-menu-id")).toBe(false);
	});
});
