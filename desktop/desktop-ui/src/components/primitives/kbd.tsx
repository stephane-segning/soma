/**
 * Kbd — daisyUI 5 keyboard-key primitive.
 *
 * Wraps `<kbd class="kbd">` with size variants and a convenience for
 * chord rendering. Use for every "this is a keyboard key" surface so
 * the visual stays consistent — MenuItem shortcut slots, command
 * palette shortcut hints, TreePopover footer chip-strip, inline docs.
 *
 * Three input forms are accepted:
 *
 *   <Kbd>⌘</Kbd>                          single key, one cap
 *   <Kbd>⌘⇧F</Kbd>                        chord of unicode glyphs, auto-split per grapheme
 *   <Kbd>Ctrl+Shift+Del</Kbd>             chord of multi-char names, split on `+`
 *   <Kbd>{["⌘", "K"]}</Kbd>               explicit array, full control
 *
 * The chord shape mirrors daisyUI's docs example: bare `+` text nodes
 * between consecutive `<kbd class="kbd">` elements, no wrapping span.
 */
import { Fragment, type ReactNode } from "react";
import { cn } from "../../utils/cn";

export type KbdSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClass: Record<KbdSize, string> = {
	xs: "kbd-xs",
	sm: "kbd-sm",
	md: "", // daisyUI default
	lg: "kbd-lg",
	xl: "kbd-xl",
};

export type KbdProps = {
	/**
	 * A single key, a chord string (auto-parsed), an array of explicit
	 * key tokens, or any ReactNode for the caller-renders-its-own case.
	 */
	children: ReactNode | ReactNode[];
	size?: KbdSize;
	className?: string;
};

/**
 * Names that always render as a single keycap, even when the input
 * contains multiple characters with no `+` separator. Without this,
 * `<Kbd>Esc</Kbd>` would split into `E + S + C` (codex flagged this
 * after named labels started flowing through the primitive).
 *
 * Matching is case-insensitive. The set covers the keys that actually
 * appear as labels in our menus, plus the arrow glyphs (which would
 * otherwise be grapheme-split into `↑ + ↓`).
 */
const SINGLE_KEYCAP_NAMES = new Set<string>([
	"esc",
	"escape",
	"enter",
	"return",
	"tab",
	"space",
	"backspace",
	"delete",
	"del",
	"home",
	"end",
	"pageup",
	"pagedown",
	"up",
	"down",
	"left",
	"right",
	"f1",
	"f2",
	"f3",
	"f4",
	"f5",
	"f6",
	"f7",
	"f8",
	"f9",
	"f10",
	"f11",
	"f12",
]);

/**
 * Parse a string shortcut into individual key tokens.
 *
 * - Contains `+` → split on `+` (multi-char names like `Ctrl+Shift+Del`).
 * - Matches a known named-key in `SINGLE_KEYCAP_NAMES` → render whole
 *   as one keycap (so `Esc` stays `Esc`, not `E+S+C`).
 * - Otherwise, when length > 1, grapheme-split (mac glyph chords like
 *   `⌘⇧F`). Single graphemes render as one keycap.
 *
 * Arrow glyphs (`↑↓←→`) and other non-ASCII single graphemes round-trip
 * correctly because `Array.from` over a length-1 string yields a
 * single-element array.
 */
function parseShortcut(input: string): string[] {
	if (input.includes("+")) {
		return input
			.split("+")
			.map((part) => part.trim())
			.filter((part) => part.length > 0);
	}
	if (SINGLE_KEYCAP_NAMES.has(input.toLowerCase())) {
		return [input];
	}
	return Array.from(input);
}

export function Kbd({ children, size = "sm", className }: KbdProps) {
	const keys: ReactNode[] = Array.isArray(children)
		? children
		: typeof children === "string"
			? parseShortcut(children)
			: [children];

	if (keys.length === 1) {
		return (
			<kbd className={cn("kbd", sizeClass[size], className)}>{keys[0]}</kbd>
		);
	}

	// Chord: bare `+` text between consecutive <kbd> elements,
	// matching daisyUI's docs example shape.
	return (
		<>
			{keys.map((key, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: stable chord shape
				<Fragment key={index}>
					{index > 0 ? "+" : null}
					<kbd className={cn("kbd", sizeClass[size], className)}>{key}</kbd>
				</Fragment>
			))}
		</>
	);
}
