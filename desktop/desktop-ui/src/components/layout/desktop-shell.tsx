import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { cn } from "../../utils/cn";
import { ShellOverlayPanel } from "./desktop-shell/overlay-panel";
import { ShellPanel } from "./desktop-shell/panel";
import { useDesktopShellState } from "./desktop-shell/state";
import { useNarrowOverlayVisibility } from "./desktop-shell/use-narrow-overlay-visibility";
import { type ShellTier, useShellTier } from "./desktop-shell/use-shell-tier";
import { useViewportRect } from "./desktop-shell/use-viewport-rect";

/** Re-exported so hosts that need to mirror the shell's own tier (via
 *  `onTierChange` below) can type their local state against the same
 *  union without reaching into the `desktop-shell/` subfolder — that
 *  inner path isn't part of `@soma/ui`'s subpath export map (only
 *  whole `.tsx` modules under `components/*` are). */
export type { ShellTier } from "./desktop-shell/use-shell-tier";

export type DesktopShellProps = {
	leftColumn?: ReactNode;
	rightColumn?: ReactNode;
	/**
	 * Always-on, fixed-width column pinned to the far left, *outside* the
	 * collapsible `leftColumn` rail. Designed for an icon rail (e.g. the
	 * spaces rail) that must stay visible even when every inner panel is
	 * collapsed. Unlike `leftColumn`, the gutter has no resize handle and
	 * never animates closed — it sizes to its content's intrinsic width.
	 *
	 * Separating the gutter from `leftColumn` is what lets the inner rail
	 * collapse to width 0 (via `leftColumn={null}`) while the icon rail
	 * stays put — instead of leaving a dead, resizable empty column.
	 *
	 * Docked at "comfortable" and "tight", same as ADR-0005 §2 specs it.
	 * **Deliberately hidden at "verySmall"** — a real-phone deviation
	 * from the ADR text (which calls this "the one piece of chrome §2
	 * never asks to disappear"): a permanently-docked 52px icon column
	 * of two-letter monograms eats ~14% of a 375px screen for chrome
	 * that carries no label. `mobileNav` (a bottom tab bar) plus a
	 * space-switcher the host renders in its own `header` replace the
	 * rail's two jobs — panel navigation and space switching — at this
	 * tier only. "comfortable"/"tight" are unaffected.
	 */
	leftGutter?: ReactNode;
	children?: ReactNode;
	header?: (controls: {
		leftOpen: boolean;
		rightOpen: boolean;
		toggleLeft: () => void;
		toggleRight: () => void;
		hasLeft: boolean;
		hasRight: boolean;
	}) => ReactNode;
	footer?: ReactNode;
	/**
	 * Bottom navigation bar shown **only** at the "verySmall" tier —
	 * see `leftGutter`'s doc comment for why that tier drops the spaces
	 * rail and needs a replacement nav surface. Renders full-width,
	 * below the content row and inside the shell's own
	 * safe-area-bottom padding (the root element already pads for
	 * `env(safe-area-inset-bottom)` — see the inline `style` below and
	 * `useViewportRect`'s doc comment for the established contract; a
	 * `mobileNav` node must NOT add that inset again). Absent — not
	 * just visually hidden — at "comfortable"/"tight", which keep
	 * today's `mainTopLeft`/`mainTopRight` corner chips unchanged.
	 */
	mobileNav?: ReactNode;
	/**
	 * Free-form overlay layer above the entire shell. Useful for global
	 * modals, drag previews, etc.
	 */
	overlays?: ReactNode;
	/**
	 * Floating element pinned to the **top-left of the main column**
	 * (not the shell — when the left rail opens, main shrinks and this
	 * node moves with it). Designed for a `PanelChipBar`.
	 */
	mainTopLeft?: ReactNode;
	/**
	 * Floating element pinned to the **top-right of the main column**.
	 * When the right rail opens, main shrinks and this node moves with
	 * it. Designed for a `PanelChipBar`.
	 */
	mainTopRight?: ReactNode;
	className?: string;
	bodyClassName?: string;
	headerClassName?: string;
	contentClassName?: string;
	mainClassName?: string;
	defaultLeftOpen?: boolean;
	defaultRightOpen?: boolean;
	initialLeftWidth?: number;
	initialRightWidth?: number;
	/**
	 * Left rail resize bounds. The shell is "lightly resizable" on the
	 * left because the typical left content (pages, outlines) doesn't
	 * gain much from very wide rails.
	 */
	leftMinWidth?: number;
	leftMaxWidth?: number;
	/**
	 * Right rail resize bounds. Right rails host chat / inspector /
	 * tools, which want a broader range.
	 */
	rightMinWidth?: number;
	rightMaxWidth?: number;
	onLeftResizeStop?: (nextWidth: number) => void;
	onRightResizeStop?: (nextWidth: number) => void;
	/**
	 * Fired when the user dismisses the left/right rail while it's
	 * rendering as a "tight"/"verySmall"-tier overlay (scrim tap, or the
	 * fullscreen variant's own back button) — see ADR-0005 §2. The host
	 * app owns whichever state makes `leftColumn`/`rightColumn` go back
	 * to `null` (e.g. clearing its expanded-panel-ids set), same as it
	 * already does for each panel's own close button.
	 *
	 * Optional: omit it and the scrim still dims + blocks the shell
	 * behind the overlay, it just won't close on tap — the panel's own
	 * in-content close/collapse affordance is still the fallback.
	 */
	onLeftOverlayDismiss?: () => void;
	onRightOverlayDismiss?: () => void;
	/**
	 * The caller's own summary of *which* panels it is currently asking
	 * for in each column — e.g. the sorted, joined set of expanded panel
	 * ids. Only consulted at the narrow tiers, where it is how the shell
	 * tells "the user just summoned this rail" apart from "these panels
	 * happened to be expanded already". Omit it for a column that only
	 * ever hosts one panel. See `useNarrowOverlayVisibility` for what
	 * goes wrong without it.
	 */
	leftSummonKey?: string | number;
	rightSummonKey?: string | number;
	/**
	 * Title shown in the "verySmall" fullscreen overlay's own header
	 * bar, next to its back button (see `ShellOverlayPanel`) — the
	 * mobile-screen replacement for a docked panel's own card header
	 * (no separate collapse/close chrome at this tier, just the one
	 * back+title bar). Ignored at "comfortable"/"tight" and by the
	 * "drawer" overlay variant, so it's safe to pass unconditionally
	 * regardless of tier.
	 */
	leftOverlayTitle?: ReactNode;
	rightOverlayTitle?: ReactNode;
	/**
	 * Fired whenever the shell's own computed `ShellTier` changes,
	 * including once on mount. Lets the host mirror the tier into its
	 * own state for tier-dependent composition decisions that can't
	 * live inside a `DesktopShell` slot — e.g. swapping
	 * `leftColumn`/`rightColumn` between docked card content and a
	 * bare "verySmall" mobile screen, or swapping `header` content
	 * between a title and a space switcher.
	 */
	onTierChange?: (tier: ShellTier) => void;
	storageKey?: string;
};

const DEFAULT_LEFT_MIN = 200;
const DEFAULT_LEFT_MAX = 320;
const DEFAULT_RIGHT_MIN = 280;
const DEFAULT_RIGHT_MAX = 720;

export function DesktopShell(props: DesktopShellProps) {
	const state = useDesktopShellState(props);
	const shellRef = useRef<HTMLDivElement>(null);
	const tier = useShellTier(shellRef);
	// iOS keyboard fix, part 2/2 (part 1 is `body { position: fixed }` in
	// `desktop-app/src/styles.css`) — see `useViewportRect`'s doc comment
	// for why the shell has to actively re-pin itself to the visual
	// viewport's rect rather than assuming it stays at the origin.
	const viewportRect = useViewportRect();

	// Mirrors the shell's own tier out to the host — see `onTierChange`'s
	// doc comment for why this exists instead of making the host
	// recompute the same measurement independently (that would risk
	// disagreeing with this ref-based measurement whenever the shell
	// doesn't fill the full window — see `useShellTier`'s doc comment).
	useEffect(() => {
		props.onTierChange?.(tier);
	}, [tier, props.onTierChange, props]);

	const hasLeftContent = Boolean(props.leftColumn);
	const hasRightContent = Boolean(props.rightColumn);
	// Only meaningful (and only evaluated as such) once `tier` isn't
	// "comfortable" — see the hook's own docs for why this can't just be
	// `state.leftOpen/rightOpen`.
	const leftOverlayVisible = useNarrowOverlayVisibility(tier, hasLeftContent && state.leftOpen, props.leftSummonKey);
	const rightOverlayVisible = useNarrowOverlayVisibility(
		tier,
		hasRightContent && state.rightOpen,
		props.rightSummonKey,
	);

	const headerNode = useMemo(
		() =>
			props.header
				? props.header({
						leftOpen: state.leftOpen,
						rightOpen: state.rightOpen,
						toggleLeft: state.toggleLeft,
						toggleRight: state.toggleRight,
						hasLeft: Boolean(props.leftColumn),
						hasRight: Boolean(props.rightColumn),
					})
				: null,
		[props.header, props.leftColumn, props.rightColumn, state, props],
	);

	const leftMinWidth = props.leftMinWidth ?? DEFAULT_LEFT_MIN;
	const leftMaxWidth = props.leftMaxWidth ?? DEFAULT_LEFT_MAX;
	const rightMinWidth = props.rightMinWidth ?? DEFAULT_RIGHT_MIN;
	const rightMaxWidth = props.rightMaxWidth ?? DEFAULT_RIGHT_MAX;

	// ADR-0005 §2: "comfortable" docks both rails inline exactly as
	// before; "tight" renders a summoned rail as a partial-width drawer
	// over a scrim; "verySmall" renders it as a fullscreen takeover, and
	// nothing is summoned by default so the editor stays the priority
	// surface. The `leftGutter` icon strip is docked at "comfortable" and
	// "tight" same as the ADR specs; "verySmall" is the one deliberate
	// deviation — see that prop's doc comment.
	const dockRails = tier === "comfortable";
	// Whether `mainTopLeft`/`mainTopRight` float as an absolute corner
	// overlay over `main`. True at "comfortable" *and* "tight" — pixel-
	// identical to before this change. At "verySmall" they render
	// nowhere at all: a phone-width column has no reliable top padding
	// of its own to clear the chips (observed on iPhone 17 Pro, 402px —
	// the chip bar covered "Paste an invite link…" on `/join`), and
	// four unlabelled icon chips are exactly the "no room for a label"
	// problem `mobileNav` (a bottom tab bar with text labels) replaces
	// at that tier — see `mobileNav`'s doc comment. A previous revision
	// rendered them as a reserved top row at "verySmall" instead of
	// floating them; that row is gone now that `mobileNav` covers the
	// same job with room for labels.
	const chipsFloatInCorner = tier !== "verySmall";

	return (
		<div
			className={cn("overflow-hidden bg-base-100 text-base-content", props.className)}
			ref={shellRef}
			style={{
				// `position: fixed` + a `visualViewport`-tracked rect, not
				// `relative` + `h-screen`/`100vh`: iOS/WKWebView can pan the
				// *visual* viewport within the layout viewport when an
				// editable field gains focus, which `100vh`/`100dvh` alone
				// (neither of which reports that pan) can't compensate for.
				// See `useViewportRect`'s doc comment for the full mechanism
				// and why `top`/`left` matter here as much as `height` does.
				// `100dvw`/`100dvh` at the origin is the correct fallback
				// wherever `visualViewport` is unavailable, since nothing is
				// panning or shrinking the layout viewport there either.
				position: "fixed",
				top: viewportRect ? `${viewportRect.top}px` : 0,
				left: viewportRect ? `${viewportRect.left}px` : 0,
				width: viewportRect ? `${viewportRect.width}px` : "100dvw",
				height: viewportRect ? `${viewportRect.height}px` : "100dvh",
				paddingBottom: "env(safe-area-inset-bottom, 0px)",
				paddingLeft: "env(safe-area-inset-left, 0px)",
				paddingRight: "env(safe-area-inset-right, 0px)",
			}}
		>
			{props.overlays ? <div className="pointer-events-none absolute inset-0 z-20">{props.overlays}</div> : null}
			<div className={cn("relative z-10 flex h-full w-full flex-col", props.bodyClassName)}>
				{headerNode ? (
					<div className={cn("flex flex-col border-base-300 border-b bg-base-100", props.headerClassName)}>
						{headerNode}
					</div>
				) : null}
				<div className={cn("relative flex min-h-0 flex-1 items-start overflow-hidden", props.contentClassName)}>
					{props.leftGutter && tier !== "verySmall" ? (
						// Always-on icon rail, docked at "comfortable"/"tight".
						// `shrink-0` + intrinsic width so it never collapses with
						// the resizable inner rail beside it. Hidden at
						// "verySmall" — see the `leftGutter` prop's doc comment.
						<div className="flex h-full shrink-0">{props.leftGutter}</div>
					) : null}
					{dockRails ? (
						<ShellPanel
							content={props.leftColumn}
							maxWidth={leftMaxWidth}
							minWidth={leftMinWidth}
							onResizeStop={(next) => {
								state.setLeftWidth(next);
								props.onLeftResizeStop?.(next);
							}}
							open={state.leftOpen}
							side="left"
							width={state.leftWidth}
						/>
					) : null}
					{/* Main column. Two-layer structure: the OUTER `<main>` is
					    `relative` and `overflow-hidden`; the INNER scroll
					    container holds the scrollable children. While
					    `chipsFloatInCorner` ("comfortable" and "tight"),
					    `mainTopLeft` / `mainTopRight` are absolutely positioned
					    against the outer `<main>`, *outside* the scrollable
					    inner — so they stay pinned to the visible top corners
					    no matter how far the user scrolls. Previous revisions
					    nested the overlays inside the same element that owned
					    `overflow-auto`, which made the chip bars disappear once
					    the doc was scrolled (eliminating the only affordance to
					    re-open collapsed panels). The `<main>` element still
					    owns the `mainClassName` so callers can theme the
					    surface as before.

					    At "verySmall", `mainTopLeft`/`mainTopRight` render
					    nowhere — see `chipsFloatInCorner`'s doc comment above
					    for why (both the original corner-overlap bug and the
					    `mobileNav` replacement). "tight" (~960-1280px, e.g. a
					    laptop in split view) keeps the corner-float behaviour
					    unchanged — `main` is still wide enough there for a
					    route's own padding to clear the chips, and it's the
					    width Storybook's manual verification pass already
					    covers, so there's no reason to move it off the
					    previously-verified presentation. */}
					<main
						className={cn(
							// `self-stretch` overrides the row's `items-start`, which
							// would otherwise leave this column at its content
							// height and strand dead `bg-base-200` under the
							// editor. Applied here rather than flipping the row to
							// `items-stretch` so the gutter and rails keep the
							// cross-axis behavior they were written against.
							"relative flex max-h-full min-h-0 flex-1 flex-col self-stretch overflow-hidden",
							props.mainClassName,
						)}
					>
						{/* A flex column, not a plain block: routed children
						    legitimately want to fill this scroll region
						    (`flex-1` + `min-h-0`), and `flex-1` on a child of a
						    `display: block` parent is silently inert — it
						    collapses to content height and strands the shell's
						    `bg-base-200` under the page. Costs nothing for
						    content-sized children, which stack the same way. */}
						<div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">{props.children}</div>
						{chipsFloatInCorner && props.mainTopLeft ? (
							<div
								className="pointer-events-none absolute z-10"
								style={{
									left: "0.5rem",
									top: "max(0.5rem, env(safe-area-inset-top, 0px))",
								}}
							>
								<div className="pointer-events-auto">{props.mainTopLeft}</div>
							</div>
						) : null}
						{chipsFloatInCorner && props.mainTopRight ? (
							<div
								className="pointer-events-none absolute z-10"
								style={{
									right: "0.5rem",
									top: "max(0.5rem, env(safe-area-inset-top, 0px))",
								}}
							>
								<div className="pointer-events-auto">{props.mainTopRight}</div>
							</div>
						) : null}
					</main>
					{dockRails ? (
						<ShellPanel
							content={props.rightColumn}
							maxWidth={rightMaxWidth}
							minWidth={rightMinWidth}
							onResizeStop={(next) => {
								state.setRightWidth(next);
								props.onRightResizeStop?.(next);
							}}
							open={state.rightOpen}
							side="right"
							width={state.rightWidth}
						/>
					) : null}
					{!dockRails ? (
						<>
							<ShellOverlayPanel
								content={props.leftColumn}
								onDismiss={props.onLeftOverlayDismiss}
								open={leftOverlayVisible}
								side="left"
								title={props.leftOverlayTitle}
								variant={tier === "verySmall" ? "fullscreen" : "drawer"}
								width={state.leftWidth}
							/>
							<ShellOverlayPanel
								content={props.rightColumn}
								onDismiss={props.onRightOverlayDismiss}
								open={rightOverlayVisible}
								side="right"
								title={props.rightOverlayTitle}
								variant={tier === "verySmall" ? "fullscreen" : "drawer"}
								width={state.rightWidth}
							/>
						</>
					) : null}
				</div>
				{tier === "verySmall" && props.mobileNav ? (
					// Sibling of the content row, inside this wrapper's own
					// `h-full` box — which the *outer* div has already shrunk
					// by `paddingBottom: env(safe-area-inset-bottom)` below, so
					// this bar's bottom edge lands clear of the inset without
					// adding that padding a second time. See `mobileNav`'s doc
					// comment.
					<div className="shrink-0">{props.mobileNav}</div>
				) : null}
				{props.footer ? <div>{props.footer}</div> : null}
			</div>
		</div>
	);
}
