/**
 * ShellOverlayPanel — the "tight" / "verySmall" tier presentation for a
 * side rail (ADR-0005 §2). Renders the exact same `content` `ShellPanel`
 * would dock inline at the "comfortable" tier, but as a scrimmed overlay
 * instead of a column that shrinks `main`:
 *
 *  - `"drawer"` — partial-width panel sliding in from the rail's edge,
 *    over a dimmed scrim covering the rest of the shell. Tapping the
 *    scrim (or the `Escape` key) requests dismissal via `onDismiss`.
 *  - `"fullscreen"` — the panel takes the entire shell body. Since
 *    there's no visible "outside" to tap, it gets its own small
 *    dismiss affordance instead of relying on a scrim.
 *
 * Positioned `absolute inset-0` against `DesktopShell`'s content row
 * (below the header, above `main`) rather than `fixed` against the
 * viewport — that way it never has to know the header's height.
 *
 * The `"fullscreen"` variant's header bar can also carry a `title`,
 * next to the back button — the mobile-screen replacement for whatever
 * card-style header `content` would otherwise draw itself (no collapse
 * button, no second header stacked underneath this one; see
 * `DesktopShell`'s `leftOverlayTitle`/`rightOverlayTitle`). Ignored by
 * `"drawer"`, which keeps `content`'s own header exactly as before.
 */
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "react-feather";
import { useT } from "../../../i18n/use-t";
import { cn } from "../../../utils/cn";

export type ShellOverlayVariant = "drawer" | "fullscreen";

type ShellOverlayPanelProps = {
	content?: ReactNode;
	open: boolean;
	side: "left" | "right";
	variant: ShellOverlayVariant;
	/** Drawer width in px (clamped against the viewport). Ignored for `"fullscreen"`. */
	width: number;
	/** Scrim tap (drawer) or the panel's own back affordance (fullscreen). Optional — degrades to "close from inside the panel only" when omitted. */
	onDismiss?: () => void;
	/** `"fullscreen"`-only header title — see the module doc comment. Ignored for `"drawer"`. */
	title?: ReactNode;
};

const SLIDE_FROM: Record<"left" | "right", string> = {
	left: "-100%",
	right: "100%",
};

export function ShellOverlayPanel({
	content,
	open,
	side,
	variant,
	width,
	onDismiss,
	title,
}: ShellOverlayPanelProps) {
	const t = useT();
	const shouldShow = open && Boolean(content);
	const BackIcon = side === "left" ? ChevronLeft : ChevronRight;

	return (
		<AnimatePresence initial={false}>
			{shouldShow ? (
				<div className="absolute inset-0 z-20" role="presentation">
					{variant === "drawer" ? (
						<motion.button
							animate={{ opacity: 1 }}
							aria-label={t({
								id: "shell.overlay.dismiss",
								defaultMessage: "Close panel",
							})}
							className="absolute inset-0 h-full w-full cursor-default bg-base-content/30 backdrop-blur-[1px]"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={onDismiss}
							transition={{ duration: 0.18, ease: "easeOut" }}
							type="button"
						/>
					) : null}
					<motion.div
						animate={{ x: 0 }}
						className={cn(
							"absolute inset-y-0 flex flex-col overflow-hidden bg-base-100 shadow-lg",
							side === "left" ? "left-0" : "right-0",
							variant === "fullscreen" && "inset-x-0",
						)}
						exit={{ x: SLIDE_FROM[side] }}
						initial={{ x: SLIDE_FROM[side] }}
						style={
							variant === "drawer"
								? { width: `min(${width}px, 88vw)` }
								: undefined
						}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						{variant === "fullscreen" && (onDismiss || title) ? (
							<div
								className="flex h-9 shrink-0 items-center gap-1 border-base-300 border-b px-1"
								style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
							>
								{onDismiss ? (
									<button
										aria-label={t({
											id: "shell.overlay.back",
											defaultMessage: "Back",
										})}
										className="shell-tap-target grid size-7 shrink-0 place-items-center rounded-md text-base-content/60 hover:bg-base-200 hover:text-base-content"
										onClick={onDismiss}
										type="button"
									>
										<BackIcon aria-hidden className="size-4" />
									</button>
								) : null}
								{title ? (
									<h2 className="min-w-0 flex-1 truncate px-1 font-medium text-base-content/90 text-sm">
										{title}
									</h2>
								) : null}
							</div>
						) : null}
						<div className="scrollbar-none min-h-0 flex-1 overflow-auto">
							{content}
						</div>
					</motion.div>
				</div>
			) : null}
		</AnimatePresence>
	);
}
