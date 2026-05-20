/**
 * DenseRow — the single list-row primitive used by every list in the
 * revamped UI: members, bots, attachments, recent docs.
 *
 * Locked by [ADR-0005 §9](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md)
 * and the slot model in
 * [refs files-density §4](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-files-density.md).
 *
 * Slot order, left to right:
 *
 *   `leading`  ·  `primary` (+ `sub`)  ·  `status`  ·  `meta`  ·  `actions` (overflow)
 *
 * Overflow actions are **always visible** — never hover-only — per
 * ADR-0005 §9.
 */
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useDensityValue } from "../primitives/density-provider";
import { cn } from "../../utils/cn";

export type DenseRowTier = "text" | "avatar" | "card";

export type DenseRowProps = {
	/** Avatar, icon, file-type glyph, etc. Optional. */
	leading?: ReactNode;
	/** The required primary label. */
	primary: ReactNode;
	/** Optional secondary line below the primary. Implies `card` tier. */
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
	/**
	 * Row-height tier. Defaults to `avatar` when `leading` is set or
	 * `sub` is provided, otherwise `text`. Tier `card` is forced when
	 * `sub` is provided regardless.
	 */
	tier?: DenseRowTier;
	/** Renders as a button when set. Fires on click or on Enter/Space. */
	onClick?: (
		event:
			| MouseEvent<HTMLDivElement>
			| KeyboardEvent<HTMLDivElement>,
	) => void;
	className?: string;
	"aria-label"?: string;
};

export function DenseRow({
	leading,
	primary,
	sub,
	status,
	meta,
	actions,
	tier,
	onClick,
	className,
	...rest
}: DenseRowProps) {
	const resolvedTier: DenseRowTier =
		tier ?? (sub ? "card" : leading ? "avatar" : "text");

	// Density-aware: dense default; cozy/oversized bump every row up a tier.
	const tierFromDensity = useDensityValue<DenseRowTier>({
		dense: resolvedTier,
		cozy: bumpTier(resolvedTier),
		oversized: "card",
	});

	const tierClass = tierToClass[tierFromDensity];

	return (
		<div
			className={cn(
				// Note: we considered migrating to daisyUI 5's `list-row` here,
				// but daisy's grid template assumes ordered slot children
				// (one positional grid column per child element) while our
				// API has named slots that are conditionally rendered. Keep
				// the hand-rolled flex layout — it gives us the conditional
				// slot freedom without the grid template fighting us.
				"flex w-full items-center gap-3 rounded-md px-3 text-sm",
				tierClass,
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
			{leading ? (
				<div className="flex shrink-0 items-center justify-center">
					{leading}
				</div>
			) : null}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="truncate text-sm text-base-content/90">{primary}</div>
				{sub ? (
					<div className="truncate text-xs text-base-content/60">
						{sub}
					</div>
				) : null}
			</div>
			{status ? <div className="shrink-0">{status}</div> : null}
			{meta ? (
				<div className="shrink-0 text-xs text-base-content/60">{meta}</div>
			) : null}
			{actions ? (
				// Stop propagation so action buttons don't also fire the row's
				// onClick / keyboard handlers when the row is interactive.
				<div
					className="shrink-0"
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					{actions}
				</div>
			) : null}
		</div>
	);
}

const tierToClass: Record<DenseRowTier, string> = {
	text: "row-text",
	avatar: "row-avatar",
	card: "row-card",
};

function bumpTier(tier: DenseRowTier): DenseRowTier {
	if (tier === "text") return "avatar";
	return "card";
}
