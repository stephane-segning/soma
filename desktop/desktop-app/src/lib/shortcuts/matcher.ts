/**
 * matcher — pure helpers behind the shortcut registry.
 *
 * Deliberately dependency-free (no DOM globals assumed, no
 * `@tauri-apps/*`, no React) so it runs identically in the browser, in
 * the Tauri webview, and under a plain Node test runner. Every
 * function here takes duck-typed inputs rather than real DOM/browser
 * types, which is what makes them testable without a DOM harness.
 */

import type { Chord, ShortcutDefinition } from "./chords";

/** Subset of `KeyboardEvent` this module actually reads. */
export type KeyboardEventLike = {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
};

/** Subset of `EventTarget` / `Element` this module actually reads. */
export type EditableTargetLike = {
	tagName?: string;
	isContentEditable?: boolean;
} | null;

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * True when `target` is somewhere a chord should not hijack normal
 * typing: a form control, or a `contenteditable` subtree (the TipTap
 * editor sets `contenteditable` on its root, and `isContentEditable`
 * is `true` for every descendant text node's parent element too).
 */
export function isEditableTarget(target: EditableTargetLike): boolean {
	if (!target) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName?.toUpperCase();
	return tag !== undefined && EDITABLE_TAGS.has(tag);
}

/**
 * Matches a `keydown` event against a declared chord. `chord.mod`
 * accepts either `metaKey` (mac ⌘) or `ctrlKey` (everywhere else) —
 * the two are never both required, matching Tauri's `CmdOrCtrl`
 * accelerator convention. `altKey` is never part of a declared chord
 * today, so a held Option/Alt always disqualifies a match — this
 * avoids clashing with OS-level Alt combinations.
 */
export function eventMatchesChord(event: KeyboardEventLike, chord: Chord): boolean {
	if (event.key.toLowerCase() !== chord.key.toLowerCase()) return false;
	if (event.altKey) return false;
	const modPressed = event.metaKey || event.ctrlKey;
	if (modPressed !== chord.mod) return false;
	const shiftWanted = chord.shift ?? false;
	if (event.shiftKey !== shiftWanted) return false;
	return true;
}

/** Subset of `KeyboardEvent` the dispatch decision reads, beyond the chord fields. */
export type DispatchEventLike = KeyboardEventLike & {
	repeat: boolean;
	/** True when a handler closer to the target already consumed this key. */
	defaultPrevented: boolean;
};

/**
 * The whole "should this keydown run a command, and which one" decision,
 * as one pure function so it can be tested without a DOM.
 *
 * Three rules, in order:
 *  1. **Auto-repeat is ignored** — holding a chord must not fire it repeatedly.
 *  2. **An already-consumed event is left alone.** We listen on `document`
 *     in the bubble phase, so a handler nearer the target ran first. TipTap's
 *     `Mod-k` (the Link extension in `@soma/editor`) returns `true`, which
 *     makes ProseMirror call `preventDefault()`. Ignoring that would fire the
 *     editor's link input *and* the palette from one ⌘K — and on an empty
 *     selection the editor consumes the chord precisely so the host's ⌘K
 *     won't fire, an intent we'd be overriding.
 *  3. **`focus-aware` chords yield to typing**; `global` ones (⌘K, ⌘N) don't.
 *
 * Returns the definition to run, or `null` to let the event through.
 */
export function resolveShortcut(
	event: DispatchEventLike,
	target: EditableTargetLike,
	shortcuts: readonly ShortcutDefinition[],
): ShortcutDefinition | null {
	if (event.repeat) return null;
	if (event.defaultPrevented) return null;
	for (const def of shortcuts) {
		if (!eventMatchesChord(event, def.chord)) continue;
		if (def.scope === "focus-aware" && isEditableTarget(target)) continue;
		return def;
	}
	return null;
}

export type Platform = "mac" | "other";

/** Duck-typed subset of `Navigator` — lets tests inject a fake instead of relying on a real DOM global. */
export type NavigatorLike = {
	platform?: string;
	userAgent?: string;
};

/**
 * Mac-vs-everything-else, sniffed from `navigator.platform` /
 * `navigator.userAgent`. `@tauri-apps/plugin-os` would give an exact
 * OS, but pulling it into this module would violate the "no
 * `@tauri-apps/*` in the shortcut core" constraint — and browser
 * sniffing is all the display formatter actually needs.
 */
export function detectPlatform(nav?: NavigatorLike): Platform {
	const resolved = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
	const probe = `${resolved?.platform ?? ""} ${resolved?.userAgent ?? ""}`;
	return /Mac|iPhone|iPad|iPod/i.test(probe) ? "mac" : "other";
}

function displayKey(key: string): string {
	if (key.length === 1) return key.toUpperCase();
	return key;
}

/**
 * Renders a chord for display — `⌘N` / `⌘⇧N` on mac, `Ctrl+N` /
 * `Ctrl+Shift+N` elsewhere. The mac form deliberately orders ⌘ before
 * ⇧ (matching the existing `<Kbd>⌘⇧F</Kbd>` convention documented in
 * `@soma/ui`'s `Kbd` primitive) rather than the stricter Apple HIG
 * ⇧-before-⌘ ordering.
 *
 * The result is a single string rather than a token array so it drops
 * straight into `CommandPaletteItem.shortcut` — `Kbd` auto-splits it
 * (grapheme-split on mac, `+`-split elsewhere) into individual keycaps.
 */
export function formatShortcut(chord: Chord, platform: Platform = detectPlatform()): string {
	if (platform === "mac") {
		return `${chord.mod ? "⌘" : ""}${chord.shift ? "⇧" : ""}${displayKey(chord.key)}`;
	}
	const parts: string[] = [];
	if (chord.mod) parts.push("Ctrl");
	if (chord.shift) parts.push("Shift");
	parts.push(displayKey(chord.key));
	return parts.join("+");
}
