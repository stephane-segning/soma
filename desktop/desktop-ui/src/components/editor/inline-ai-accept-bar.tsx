/**
 * InlineAIAcceptBar — anchored under an AI-inserted region after
 * streaming completes.
 *
 * Locked by [refs editor-ai §4](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-editor-ai.md)
 * and [ADR-0005 §13](../../../../../docs/src/architecture/adrs/0005-ui-revamp-v0.md).
 *
 * Buttons: **Accept · Try again · Refine… · Discard · Open in chat**.
 * No diff view in v0 (prose-first; diff is a Wave-4.1 follow-up for
 * code-block nodes). `Open in chat` exists to escalate a one-shot
 * rewrite into a full conversation in the right-area chat panel —
 * the same audit log that already captures every inline invocation
 * (ADR §13).
 *
 * The bar is presentational. Caller owns the dispatch + the editor
 * range the bar is anchored under.
 */
import type { ReactNode } from "react";
import { Check, MessageCircle, RotateCw, Sliders, X } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";

export type InlineAIAcceptBarProps = {
	onAccept: () => void;
	onDiscard: () => void;
	onTryAgain?: () => void;
	/** Reopens the SelectionAIBar with the previous prompt pre-filled. */
	onRefine?: () => void;
	/** Escalates the rewrite into the right-area chat panel. */
	onOpenInChat?: () => void;
	/** Display the prompt that produced this output, for context. */
	prompt?: ReactNode;
	className?: string;
};

export function InlineAIAcceptBar({
	onAccept,
	onDiscard,
	onTryAgain,
	onRefine,
	onOpenInChat,
	prompt,
	className,
}: InlineAIAcceptBarProps) {
	const t = useT();
	return (
		<div
			aria-label={t({
				id: "inline-ai-accept-bar.aria-label",
				defaultMessage: "AI suggestion actions",
			})}
			className={cn(
				"glass-panel shadow-elevated flex flex-wrap items-center gap-1 p-1",
				className,
			)}
			// `role="group"` not `toolbar`: we rely on the default tab
			// order between buttons and don't implement the arrow-key
			// focus management the WAI-ARIA toolbar pattern requires.
			role="group"
		>
			{prompt ? (
				<span className="px-2 py-0.5 text-base-content/60 text-ui-xs">
					{prompt}
				</span>
			) : null}
			<button
				className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-content text-ui-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
				onClick={onAccept}
				type="button"
			>
				<Check aria-hidden className="size-3.5" />
				{t({ id: "inline-ai-accept-bar.accept", defaultMessage: "Accept" })}
			</button>
			{onTryAgain ? (
				<SecondaryButton onClick={onTryAgain}>
					<RotateCw aria-hidden className="size-3.5" />
					{t({
						id: "inline-ai-accept-bar.try-again",
						defaultMessage: "Try again",
					})}
				</SecondaryButton>
			) : null}
			{onRefine ? (
				<SecondaryButton onClick={onRefine}>
					<Sliders aria-hidden className="size-3.5" />
					{t({ id: "inline-ai-accept-bar.refine", defaultMessage: "Refine…" })}
				</SecondaryButton>
			) : null}
			{onOpenInChat ? (
				<SecondaryButton onClick={onOpenInChat}>
					<MessageCircle aria-hidden className="size-3.5" />
					{t({
						id: "inline-ai-accept-bar.open-in-chat",
						defaultMessage: "Open in chat",
					})}
				</SecondaryButton>
			) : null}
			<SecondaryButton
				onClick={onDiscard}
				tone="danger"
			>
				<X aria-hidden className="size-3.5" />
				{t({ id: "inline-ai-accept-bar.discard", defaultMessage: "Discard" })}
			</SecondaryButton>
		</div>
	);
}

function SecondaryButton({
	onClick,
	children,
	tone = "neutral",
}: {
	onClick: () => void;
	children: ReactNode;
	tone?: "neutral" | "danger";
}) {
	return (
		<button
			className={cn(
				"inline-flex items-center gap-1 rounded-md px-2 py-1 text-ui-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				tone === "danger"
					? "text-base-content/70 hover:bg-error/10 hover:text-error"
					: "text-base-content/80 hover:bg-base-200 hover:text-base-content",
			)}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}
