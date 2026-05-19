/**
 * Pill — a small inline label used for status, counts, metadata, and
 * default markers across the UI. Locked by the refs at
 * [refs assistant-bots §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-assistant-bots.md)
 * and [refs files-density §4](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-files-density.md).
 *
 * Variants follow the locked matrix from
 * [scaffold §8 open question 2](../../../../../docs/src/architecture/prd/ui-revamp-v0-scaffold.md):
 * tone × dot are independent props, but the semantic combos used
 * across the app are listed in the file's JSDoc to keep consumers
 * from inventing new ones.
 */
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type PillTone =
	| "neutral"
	| "info"
	| "success"
	| "warning"
	| "error";

/**
 * `false` — no leading dot.
 * `true` — solid dot in the tone color.
 * `"pulse"` — solid dot with a pulsing animation (used for
 *   in-progress / pending states).
 */
export type PillDot = boolean | "pulse";

export type PillProps = {
	tone?: PillTone;
	dot?: PillDot;
	children: ReactNode;
	className?: string;
	"aria-label"?: string;
};

// Map our semantic tones onto daisyUI's `badge-soft` style — a softer
// tinted surface (lighter bg + matching text colour) that reads as a
// status chip rather than a button. daisyUI 5 ships this modifier so
// we can drop the hand-mixed `bg-info/10` form. `neutral` falls back to
// the plain (no-tone) soft badge so it inherits the theme's neutral
// palette.
const toneBadgeClass: Record<PillTone, string> = {
	neutral: "",
	info: "badge-info",
	success: "badge-success",
	warning: "badge-warning",
	error: "badge-error",
};

// Dot colour — slightly darker than the badge background so the dot
// reads as a status indicator, not a background blob. daisyUI provides
// `--color-*` tokens we can lean on.
const toneDot: Record<PillTone, string> = {
	neutral: "bg-base-content/70",
	info: "bg-info-content",
	success: "bg-success-content",
	warning: "bg-warning-content",
	error: "bg-error-content",
};

export function Pill({
	tone = "neutral",
	dot = false,
	children,
	className,
	...rest
}: PillProps) {
	return (
		<span
			className={cn(
				// Lean on daisyUI's `.badge` primitive for the surface,
				// `.badge-sm` for the smaller chip footprint, `.badge-soft`
				// for the softer tinted style, and the tone modifier picked
				// above. We add `gap-1.5` for the dot spacing since daisyUI's
				// default gap is tighter than we want.
				"badge badge-sm badge-soft gap-1.5",
				toneBadgeClass[tone],
				className,
			)}
			{...rest}
		>
			{dot ? (
				<span
					aria-hidden
					className={cn(
						"inline-block size-1.5 rounded-full",
						toneDot[tone],
						dot === "pulse" && "animate-pulse",
					)}
				/>
			) : null}
			{children}
		</span>
	);
}

/**
 * Locked semantic combos — keep this list in sync as new uses appear.
 * Consumers should compose `tone` + `dot` directly; this table is just
 * documentation so the same status across the app picks the same
 * combo.
 *
 * - Bot pending: `<Pill tone="neutral" dot="pulse">Pending</Pill>`
 * - Bot active:  `<Pill tone="success" dot>Active</Pill>`
 * - Bot failed:  `<Pill tone="error" dot>Failed</Pill>`
 * - Default backend marker: `<Pill tone="info">Default</Pill>`
 * - Capability scope count: `<Pill tone="neutral">5 scopes</Pill>`
 */
