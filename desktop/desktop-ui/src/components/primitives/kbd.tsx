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
 * Parse a string shortcut into individual key tokens.
 *
 * - Contains `+` → split on `+`, useful for multi-char names like
 *   `Ctrl+Shift+Del`.
 * - Otherwise treat each grapheme as its own key, useful for
 *   concatenated mac glyphs like `⌘⇧F` or `⌘,`. `Array.from(str)`
 *   yields code points which is correct for the modifier symbols we
 *   use (all live in the BMP).
 */
function parseShortcut(input: string): string[] {
	if (input.includes("+")) {
		return input
			.split("+")
			.map((part) => part.trim())
			.filter((part) => part.length > 0);
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
		return <kbd className={cn("kbd", sizeClass[size], className)}>{keys[0]}</kbd>;
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
