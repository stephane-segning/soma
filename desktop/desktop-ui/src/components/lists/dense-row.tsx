/**
 * DenseRow — the single list-row primitive used by every list in the
 * revamped UI: members, bots, attachments, recent docs.
 *
 * Locked by [ADR-0005 §9](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and the slot model in
 * [refs files-density §4](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-files-density.md).
 *
 * Layout uses daisyUI 5's `list-row` class — children are arranged as
 * positional grid columns, with `list-col-grow` marking the column
 * that should consume remaining space. Daisy provides the padding
 * and inter-row dividers; we don't override either. This component
 * MUST be rendered inside a `<ul class="list">` so daisy's selectors
 * apply (see `BotList` for the canonical wrapper).
 *
 * Slot order, left to right:
 *
 *   `leading`  ·  `primary` (+ `sub`)  ·  `status`  ·  `meta`  ·  `actions`
 *
 * Overflow actions are **always visible** — never hover-only — per
 * ADR-0005 §9.
 */
import { forwardRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { cn } from "../../utils/cn";

export type DenseRowProps = {
	/** Avatar, icon, file-type glyph, etc. Optional. */
	leading?: ReactNode;
	/** The required primary label. */
	primary: ReactNode;
	/** Optional secondary line below the primary. */
	sub?: ReactNode;
	/** Status pill or similar inline indicator. */
	status?: ReactNode;
	/** Right-aligned metadata (timestamp, size, peer-id, etc.). */
	meta?: ReactNode;
	/**
	 * Overflow actions (typically a `⋯` button). Always visible — do
	 * not gate behind hover.
	 */
	actions?: ReactNode;
	/** Renders as a button when set. Fires on click or on Enter/Space. */
	onClick?: (
		event: MouseEvent<HTMLLIElement> | KeyboardEvent<HTMLLIElement>,
	) => void;
	className?: string;
	"aria-label"?: string;
};

export const DenseRow = forwardRef<HTMLLIElement, DenseRowProps>(function DenseRow(
	{ leading, primary, sub, status, meta, actions, onClick, className, ...rest },
	ref,
) {
	return (
		<li
			ref={ref}
			className={cn(
				"list-row",
				// No `transition-colors` — row-list highlights snap (see MenuItem).
				onClick &&
					"cursor-pointer hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				className,
			)}
			onClick={onClick}
			onKeyDown={
				onClick
					? (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onClick(event);
							}
						}
					: undefined
			}
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
			{...rest}
		>
			{leading != null ? <span>{leading}</span> : null}
			{/* The primary + sub wrapper carries `list-col-grow` so it consumes
			    the remaining horizontal space regardless of which other slots
			    are rendered. Without that, daisy's `list-row` defaults to the
			    second positional child growing, which breaks when `leading`
			    is omitted (primary would then be 1st child and not grow). */}
			<div className="list-col-grow flex min-w-0 flex-col">
				<div className="truncate text-sm text-base-content/90">{primary}</div>
				{sub ? (
					<div className="truncate text-xs text-base-content/60">{sub}</div>
				) : null}
			</div>
			{status ? <span>{status}</span> : null}
			{meta ? <span className="text-xs text-base-content/60">{meta}</span> : null}
			{actions ? (
				// Stop propagation so action buttons don't also fire the row's
				// onClick / keyboard handlers when the row is interactive.
				<span
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					{actions}
				</span>
			) : null}
		</li>
	);
});
