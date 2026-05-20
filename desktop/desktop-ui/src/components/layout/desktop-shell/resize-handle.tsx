/**
 * Resize handle — a single hairline divider between the side panel and
 * the main content. The visible line is always 1px (the same weight as
 * any other shell divider); on hover the line shifts to the primary
 * accent so the user gets a "this is grabbable" affordance without the
 * line itself getting fatter or animating.
 *
 * The hit area is wider than the line: a 7px-wide invisible strip
 * straddles the divider so users don't have to pixel-hunt with the
 * cursor. `cursor-col-resize` is set on the wrapper so the cursor
 * changes the moment it enters the hit area, not just when it lands
 * exactly on the line.
 *
 * Earlier revisions rendered a 1.5px-to-2.5px-wide pill in the middle
 * of the divider that grew on hover — that "rubber band" effect is
 * what the user called out as ugly. We don't do that anymore.
 */
export function ResizeHandle() {
	return (
		<div
			aria-hidden
			className="group relative -mx-[3px] h-full w-[7px] cursor-col-resize"
			role="none"
		>
			<span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-base-300 group-hover:bg-primary/60 group-active:bg-primary" />
		</div>
	);
}
