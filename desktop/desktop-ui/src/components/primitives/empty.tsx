/**
 * Empty — the single empty-state primitive used everywhere in the UI.
 * Three variants per ADR-0005 §8 and refs at
 * [refs files-density §2](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-files-density.md):
 *
 * - `full` — icon + headline + optional subtext + optional CTA. Used
 *   in main column-width empty states (no spaces, no documents, etc.).
 * - `compact` — dashed-border single line, no icon. For narrow panels
 *   (chat panel, attachments panel, sub-pages).
 * - `filter` — same shape as compact, but a `Clear filter ×` action
 *   is appended. For lists that emptied because of a filter.
 *
 * The empty *document* is NOT an `Empty` use — it's an editor
 * placeholder. See ADR-0005 §8.
 */
import type { ReactNode } from "react";
import { X } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type EmptyProps = {
	/** Defaults to `full`. */
	variant?: "full" | "compact" | "filter";
	/** Only rendered in `full` variant. */
	icon?: ReactNode;
	/**
	 * The primary line. Required. In `compact` and `filter` it is the
	 * only text; in `full` it is the headline.
	 */
	headline: ReactNode;
	/** Only rendered in `full` variant. */
	subtext?: ReactNode;
	/** Only rendered in `full` variant. */
	cta?: ReactNode;
	/**
	 * Required for `filter` variant — wires the `Clear filter ×` action.
	 * Ignored for `full` and `compact`.
	 */
	onClear?: () => void;
	className?: string;
};

export function Empty(props: EmptyProps) {
	const variant = props.variant ?? "full";
	if (variant === "compact") return <CompactEmpty {...props} />;
	if (variant === "filter") return <FilterEmpty {...props} />;
	return <FullEmpty {...props} />;
}

function FullEmpty({
	icon,
	headline,
	subtext,
	cta,
	className,
}: EmptyProps) {
	return (
		<div
			className={cn(
				"flex w-full flex-col items-center justify-center gap-2 px-6 py-10 text-center",
				className,
			)}
		>
			{icon ? (
				<div className="text-base-content/40 [&>*]:size-12">{icon}</div>
			) : null}
			<div className="text-body font-medium text-base-content/80">
				{headline}
			</div>
			{subtext ? (
				<div className="text-ui-sm text-base-content/60">{subtext}</div>
			) : null}
			{cta ? <div className="pt-1">{cta}</div> : null}
		</div>
	);
}

function CompactEmpty({ headline, className }: EmptyProps) {
	return (
		<div
			className={cn(
				"flex w-full items-center justify-center rounded-md border border-base-300 border-dashed px-3 py-2 text-ui-sm text-base-content/60",
				className,
			)}
		>
			{headline}
		</div>
	);
}

function FilterEmpty({ headline, onClear, className }: EmptyProps) {
	const t = useT();
	return (
		<div
			className={cn(
				"flex w-full items-center justify-between rounded-md border border-base-300 border-dashed px-3 py-2 text-ui-sm",
				className,
			)}
		>
			<span className="text-base-content/60">{headline}</span>
			{onClear ? (
				<button
					className="inline-flex items-center gap-1 text-base-content/70 transition-colors hover:text-base-content"
					onClick={onClear}
					type="button"
				>
					{t({
						id: "empty.filter.clear",
						defaultMessage: "Clear filter",
					})}
					<X aria-hidden className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
