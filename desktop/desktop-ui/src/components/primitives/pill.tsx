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

const toneSurface: Record<PillTone, string> = {
	neutral: "bg-base-200 text-base-content/80 border-base-300",
	info: "bg-info/10 text-info border-info/30",
	success: "bg-success/10 text-success border-success/30",
	warning: "bg-warning/15 text-warning border-warning/40",
	error: "bg-error/10 text-error border-error/40",
};

const toneDot: Record<PillTone, string> = {
	neutral: "bg-base-content/60",
	info: "bg-info",
	success: "bg-success",
	warning: "bg-warning",
	error: "bg-error",
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
				"inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-ui-xs font-medium",
				toneSurface[tone],
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
