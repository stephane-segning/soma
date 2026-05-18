/**
 * InlineAIStream — the streaming display primitive at the caret.
 *
 * Locked by [refs editor-ai §5](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor-ai.md)
 * and [ADR-0005 §13](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 *
 * Renders three states:
 *
 *  1. **Pre-first-token** — caller passes `pending: true` and no
 *     `text`. We show a `Thinking…` pill inline at the insertion point.
 *  2. **Streaming** — `pending: false`, `streaming: true`. Partial
 *     `text` renders with accent color + dashed accent underline; a
 *     solid round Stop button sits at the trailing edge.
 *  3. **Complete** — `streaming: false`. The accent treatment fades to
 *     normal text; the consumer typically removes the wrapper after
 *     reading the final value, or the {@link InlineAIAcceptBar} takes
 *     over visual control.
 *
 * The component is **presentational** — caller drives `text`,
 * `pending`, `streaming`, and handles `onStop`. It does NOT make the
 * surrounding range non-editable; the consumer's editor extension is
 * responsible for that (TipTap's `contenteditable=false` on the node).
 */
import { Star, Square } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type InlineAIStreamProps = {
	/** Streamed tokens so far. Empty + pending shows the Thinking pill. */
	text: string;
	/**
	 * True before the first token arrives. Renders the `Thinking…` pill
	 * in place of body text.
	 */
	pending?: boolean;
	/** True while tokens are still arriving. Shows accent styling + stop. */
	streaming?: boolean;
	/** Click handler for the stop button. Optional — read-only display omits it. */
	onStop?: () => void;
	className?: string;
};

export function InlineAIStream({
	text,
	pending,
	streaming,
	onStop,
	className,
}: InlineAIStreamProps) {
	const t = useT();

	if (pending && text.length === 0) {
		return (
			<span
				aria-busy="true"
				aria-live="polite"
				className={cn(
					"inline-flex items-center gap-1 rounded-sm bg-info/10 px-1.5 py-0.5 align-baseline font-medium text-info text-ui-xs",
					className,
				)}
			>
				<Star aria-hidden className="size-3 animate-pulse" />
				<span>
					{t({ id: "inline-ai-stream.thinking", defaultMessage: "Thinking…" })}
				</span>
			</span>
		);
	}

	return (
		<span
			aria-busy={streaming ? "true" : undefined}
			aria-live="polite"
			className={cn(
				"inline-flex items-baseline gap-1 align-baseline",
				streaming &&
					"text-info underline decoration-info decoration-dashed underline-offset-4",
				className,
			)}
		>
			<span className="min-w-0">{text}</span>
			{streaming && onStop ? (
				<button
					aria-label={t({
						id: "inline-ai-stream.stop",
						defaultMessage: "Stop generating",
					})}
					className="inline-flex size-5 items-center justify-center rounded-full bg-info text-info-content transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
					onClick={onStop}
					title={t({
						id: "inline-ai-stream.stop",
						defaultMessage: "Stop generating",
					})}
					type="button"
				>
					<Square
						aria-hidden
						className="size-2.5 fill-current text-info-content"
					/>
				</button>
			) : null}
		</span>
	);
}
