/**
 * Resize handle — invisible at rest, only a small primary-tinted pill
 * fades in on hover.
 *
 * With the floating-card aesthetic in `Panel` + `PanelContainer`, any
 * always-visible vertical divider reads as a stray line cutting through
 * the gutter between cards. The previous revision painted a 1 px
 * `bg-base-300` hairline that was always on — the user called it out
 * as breaking the UI on rails full of cards.
 *
 * Now:
 *   - **Resting state.** Nothing visible. Just a transparent 8 px-wide
 *     hit area with `cursor-col-resize`, so the cursor still changes
 *     when it enters the seam.
 *   - **Hover.** A 2 px-wide × 40 px-tall pill in `bg-primary/50` fades
 *     in via opacity (no transform — opacity only, so the affordance
 *     can't be mistaken for the kind of hover-zoom we've spent two PRs
 *     hunting down).
 *   - **Active drag.** Pill solidifies to `bg-primary`.
 *
 * The visible pill is `pointer-events-none` so the parent hit area
 * keeps owning the mouse events.
 */
export function ResizeHandle() {
	return (
		<div
			aria-hidden
			className="group relative -mx-1 h-full w-2 cursor-col-resize"
			role="none"
		>
			<span
				className="pointer-events-none absolute top-1/2 left-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-active:bg-primary group-active:opacity-100"
			/>
		</div>
	);
}
