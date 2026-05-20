/**
 * Kbd — daisyUI 5 keyboard-key primitive.
 *
 * Wraps `<kbd class="kbd">` with size variants and a convenience for
 * chord rendering. Use for every "this is a keyboard key" surface so
 * the visual stays consistent — MenuItem shortcut slots, command
 * palette shortcut hints, TreePopover footer chip-strip, inline docs.
 *
 * For a single key:
 *
 *   <Kbd>⌘</Kbd>
 *
 * For a chord, pass an array (or render multiple Kbds with separators
 * inline — both work). The array form inserts a `+` glyph between
 * keys per daisyUI's docs example.
 *
 *   <Kbd>{["⌘", "K"]}</Kbd>
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
	 * A single key as text/ReactNode (e.g. `"⌘"`, `"Enter"`), or an array
	 * of keys to render as a chord with `+` separators between.
	 */
	children: ReactNode | ReactNode[];
	size?: KbdSize;
	className?: string;
};

export function Kbd({ children, size = "sm", className }: KbdProps) {
	if (Array.isArray(children)) {
		// Per daisyUI's docs example, render chord keys with literal `+`
		// text nodes between them — no wrapping span, no extra styling.
		// The plain `+` matches the rendered shape of
		//   <kbd class="kbd">ctrl</kbd>+<kbd class="kbd">k</kbd>
		// in daisy's own demos.
		return (
			<>
				{children.map((key, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable chord shape
					<Fragment key={index}>
						{index > 0 ? "+" : null}
						<kbd className={cn("kbd", sizeClass[size], className)}>{key}</kbd>
					</Fragment>
				))}
			</>
		);
	}
	return <kbd className={cn("kbd", sizeClass[size], className)}>{children}</kbd>;
}
