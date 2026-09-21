import { describe, expect, it } from "vitest";
import type { Chord } from "./chords";
import { SHORTCUTS } from "./chords";
import {
	type DispatchEventLike,
	detectPlatform,
	eventMatchesChord,
	formatShortcut,
	isEditableTarget,
	resolveShortcut,
} from "./matcher";

function key(overrides: Partial<Parameters<typeof eventMatchesChord>[0]> = {}) {
	return {
		key: "a",
		metaKey: false,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		...overrides,
	};
}

const cmdN: Chord = { key: "n", mod: true };
const cmdShiftN: Chord = { key: "n", mod: true, shift: true };
const cmdSlash: Chord = { key: "/", mod: true };

describe("eventMatchesChord", () => {
	it("matches CmdOrCtrl+N via metaKey (mac)", () => {
		expect(eventMatchesChord(key({ key: "n", metaKey: true }), cmdN)).toBe(true);
	});

	it("matches CmdOrCtrl+N via ctrlKey (windows/linux)", () => {
		expect(eventMatchesChord(key({ key: "n", ctrlKey: true }), cmdN)).toBe(true);
	});

	it("is case-insensitive on the key", () => {
		expect(eventMatchesChord(key({ key: "N", metaKey: true }), cmdN)).toBe(true);
	});

	it("rejects when no modifier is held", () => {
		expect(eventMatchesChord(key({ key: "n" }), cmdN)).toBe(false);
	});

	it("rejects a plain key event against a mod-required chord even with the right letter", () => {
		expect(eventMatchesChord(key({ key: "n", metaKey: false, ctrlKey: false }), cmdN)).toBe(false);
	});

	it("requires shift when the chord declares it", () => {
		expect(eventMatchesChord(key({ key: "n", metaKey: true }), cmdShiftN)).toBe(false);
		expect(eventMatchesChord(key({ key: "n", metaKey: true, shiftKey: true }), cmdShiftN)).toBe(true);
	});

	it("rejects an unwanted shift on a shift-less chord", () => {
		expect(eventMatchesChord(key({ key: "n", metaKey: true, shiftKey: true }), cmdN)).toBe(false);
	});

	it("rejects when alt/option is held, even if everything else matches", () => {
		expect(eventMatchesChord(key({ key: "n", metaKey: true, altKey: true }), cmdN)).toBe(false);
	});

	it("matches a punctuation key (/) the same as a letter", () => {
		expect(eventMatchesChord(key({ key: "/", metaKey: true }), cmdSlash)).toBe(true);
	});

	it("rejects a different key entirely", () => {
		expect(eventMatchesChord(key({ key: "m", metaKey: true }), cmdN)).toBe(false);
	});
});

describe("isEditableTarget", () => {
	it("is false for null", () => {
		expect(isEditableTarget(null)).toBe(false);
	});

	it("is false for a plain div", () => {
		expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
	});

	it("is true for input/textarea/select regardless of case", () => {
		expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
		expect(isEditableTarget({ tagName: "textarea" })).toBe(true);
		expect(isEditableTarget({ tagName: "Select" })).toBe(true);
	});

	it("is true for contenteditable elements (the TipTap editor root)", () => {
		expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
	});

	it("is false for contenteditable explicitly set to false", () => {
		expect(isEditableTarget({ tagName: "DIV", isContentEditable: false })).toBe(false);
	});
});

describe("detectPlatform", () => {
	it("detects mac from navigator.platform", () => {
		expect(detectPlatform({ platform: "MacIntel", userAgent: "" })).toBe("mac");
	});

	it("detects mac from userAgent when platform is absent (iPad/iPhone)", () => {
		expect(detectPlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe("mac");
	});

	it("falls back to 'other' for windows/linux", () => {
		expect(detectPlatform({ platform: "Win32", userAgent: "Windows NT 10.0" })).toBe("other");
		expect(detectPlatform({ platform: "Linux x86_64", userAgent: "X11; Linux x86_64" })).toBe("other");
	});

	it("falls back to 'other' when given nothing at all", () => {
		expect(detectPlatform({})).toBe("other");
	});
});

describe("formatShortcut", () => {
	it("renders mac chords with ⌘ and no separator, ⌘ before ⇧", () => {
		expect(formatShortcut(cmdN, "mac")).toBe("⌘N");
		expect(formatShortcut(cmdShiftN, "mac")).toBe("⌘⇧N");
		expect(formatShortcut(cmdSlash, "mac")).toBe("⌘/");
	});

	it("renders non-mac chords as Ctrl+-joined names", () => {
		expect(formatShortcut(cmdN, "other")).toBe("Ctrl+N");
		expect(formatShortcut(cmdShiftN, "other")).toBe("Ctrl+Shift+N");
		expect(formatShortcut(cmdSlash, "other")).toBe("Ctrl+/");
	});

	it("uppercases single-character letter keys but leaves punctuation as-is", () => {
		expect(formatShortcut({ key: "n", mod: true }, "mac")).toContain("N");
		expect(formatShortcut({ key: "/", mod: true }, "other")).toBe("Ctrl+/");
	});
});

describe("resolveShortcut", () => {
	function dispatchEvent(overrides: Partial<DispatchEventLike> = {}): DispatchEventLike {
		return {
			key: "k",
			metaKey: true,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			repeat: false,
			defaultPrevented: false,
			...overrides,
		};
	}

	const editorTarget = { tagName: "DIV", isContentEditable: true };

	it("resolves a matching global chord outside any editable target", () => {
		expect(resolveShortcut(dispatchEvent(), null, SHORTCUTS)?.id).toBe("open-palette");
	});

	it("still resolves a global chord inside the editor", () => {
		// ⌘N must work while the caret is in the document body.
		const event = dispatchEvent({ key: "n" });
		expect(resolveShortcut(event, editorTarget, SHORTCUTS)?.id).toBe("new-page");
	});

	it("suppresses a focus-aware chord inside the editor but allows it outside", () => {
		const cmdSlashEvent = dispatchEvent({ key: "/" });
		expect(resolveShortcut(cmdSlashEvent, editorTarget, SHORTCUTS)).toBeNull();
		expect(resolveShortcut(cmdSlashEvent, null, SHORTCUTS)?.id).toBe("toggle-spaces-rail");
	});

	it("ignores auto-repeat so holding a chord fires once", () => {
		expect(resolveShortcut(dispatchEvent({ repeat: true }), null, SHORTCUTS)).toBeNull();
	});

	// Regression: TipTap's Link extension binds `Mod-k` and returns `true`,
	// which makes ProseMirror `preventDefault()`. Because the registry
	// listens on `document` in the bubble phase, it used to ALSO toggle the
	// palette — so one ⌘K opened the link input and the palette together.
	it("yields ⌘K to the editor's link handler once that handler consumed it", () => {
		const consumed = dispatchEvent({ defaultPrevented: true });
		expect(resolveShortcut(consumed, editorTarget, SHORTCUTS)).toBeNull();
	});

	// The editor returns `true` on an empty selection specifically to stop the
	// host's ⌘K from stealing focus. Honour that rather than overriding it.
	it("yields a consumed chord even outside an editable target", () => {
		expect(resolveShortcut(dispatchEvent({ defaultPrevented: true }), null, SHORTCUTS)).toBeNull();
	});

	it("returns null when nothing matches", () => {
		expect(resolveShortcut(dispatchEvent({ key: "j" }), null, SHORTCUTS)).toBeNull();
	});
});
