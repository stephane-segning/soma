/**
 * `cn()` — class-name composer with tailwind-merge-aware conflict resolution.
 *
 * The default tailwind-merge config doesn't know about our custom
 * font-size utilities (`text-body`, `text-ui-xs`, `text-ui-sm`) defined
 * in `tokens.css`. Without that hint, tailwind-merge groups them as
 * "could be anything starting with text-" — and when a row class like
 *   cn("... text-ui-sm", active && "bg-primary/10 text-primary")
 * is composed, `text-primary` (a colour) silently drops `text-ui-sm`
 * (a size) because tailwind-merge picks the last `text-*` token as
 * the winner of the conflict group.
 *
 * That bug surfaced as: hovering or selecting a TreePopover row made
 * the row's text grow from 13px (text-ui-sm) to the browser default
 * 16px — a visible "zoom on hover" the user had been reporting across
 * several rounds.
 *
 * The fix here teaches tailwind-merge that `text-body / text-ui-xs /
 * text-ui-sm` are font-sizes (belong in the `font-size` group, not the
 * `text-color` group), so composing them with `text-primary` no longer
 * collapses to just the colour.
 */
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": ["text-body", "text-ui-xs", "text-ui-sm"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
