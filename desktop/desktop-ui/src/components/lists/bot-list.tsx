/**
 * BotList — the list view of bots authorized in a space.
 *
 * Locked by [refs assistant-bots §3](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs-assistant-bots.md)
 * and surfaces the §4.4 Bots tab inside space settings.
 *
 * Each row is a {@link DenseRow}: file-type glyph (or avatar) + alias
 * + meta strip (peer id excerpt + last acked) + {@link Pill} status
 * + overflow menu. Failed bots get an inline error row (no toast,
 * per ADR-0005 §6).
 *
 * The empty state uses {@link Empty} `full` with an `onAddBot` CTA so
 * the very first surface a user lands on in a new space points at the
 * v0 priority flow.
 */
import { type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { AlertTriangle, Cpu, MoreHorizontal, RotateCw } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { DenseRow } from "./dense-row";
import { Empty } from "../primitives/empty";
import { Pill } from "../primitives/pill";

export type BotStatus = "pending" | "active" | "failed" | "expired";

export type Bot = {
	id: string;
	/** Human alias used in `@bot:<alias>` mentions. */
	alias: string;
	/** Full libp2p peer id; the row displays a truncated form. */
	peerId: string;
	status: BotStatus;
	/** Human-readable error reason for `failed`. Rendered inline. */
	errorReason?: string;
	/** "2m ago", "Jan 5", etc. — caller formats. */
	lastAcked?: string;
};

export type BotListProps = {
	bots: Bot[];
	onSelect?: (id: string) => void;
	onRetry?: (id: string) => void;
	/**
	 * Open the per-bot overflow menu. The caller wires the actual menu
	 * (revoke / open detail / copy peer id / …) and confirms any
	 * destructive action there. The `⋯` trigger is deliberately NOT a
	 * one-click remove — removing capability-bearing bots needs intent.
	 *
	 * `event` is the click event so the caller can position a context
	 * menu near the trigger.
	 */
	onOverflow?: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
	onAddBot?: () => void;
	/**
	 * Id of a bot to scroll into view and visually highlight. Used by
	 * deep links (e.g. `?peerId=` from a bot mention) so the user lands
	 * on the row that prompted the navigation rather than the top of
	 * the list. The caller resolves peerId → id; matching is on `bot.id`.
	 */
	highlightedId?: string;
	className?: string;
};

export function BotList({
	bots,
	onSelect,
	onRetry,
	onOverflow,
	onAddBot,
	highlightedId,
	className,
}: BotListProps) {
	const t = useT();

	if (bots.length === 0) {
		return (
			<div className={className}>
				<Empty
					cta={
						onAddBot ? (
							<button
								className="btn btn-primary btn-sm"
								onClick={onAddBot}
								type="button"
							>
								{t({
									id: "bot-list.add-cta",
									defaultMessage: "Add bot",
								})}
							</button>
						) : undefined
					}
					headline={t({
						id: "bot-list.empty.headline",
						defaultMessage: "No bots in this space yet",
					})}
					icon={<Cpu aria-hidden />}
					subtext={t({
						id: "bot-list.empty.subtext",
						defaultMessage:
							"Paste a bot's peer address to authorize it. Bots act with scoped capabilities you grant here.",
					})}
				/>
			</div>
		);
	}

	return (
		<ul
			className={cn(
				// daisyUI 5's `list` already ships row dividers — a wrapper
				// border + rounded corners on top of that just gives us
				// awkwardly rounded corners on the first/last child. Plain
				// `list bg-base-100` is the right surface.
				"list bg-base-100",
				className,
			)}
		>
			{bots.map((bot) => (
				<BotEntry
					bot={bot}
					highlighted={highlightedId === bot.id}
					key={bot.id}
					onOverflow={onOverflow}
					onRetry={onRetry}
					onSelect={onSelect}
				/>
			))}
		</ul>
	);
}

function BotEntry({
	bot,
	highlighted,
	onSelect,
	onRetry,
	onOverflow,
}: {
	bot: Bot;
	highlighted?: boolean;
	onSelect?: (id: string) => void;
	onRetry?: (id: string) => void;
	onOverflow?: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
}) {
	const t = useT();
	const truncatedPeerId = useTruncatedPeerId(bot.peerId);
	const rowRef = useRef<HTMLLIElement | null>(null);
	useEffect(() => {
		if (!highlighted) return;
		rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
	}, [highlighted]);
	return (
		<>
			<DenseRow
				ref={rowRef}
				className={highlighted ? "ring-2 ring-primary ring-inset" : undefined}
				leading={
					<span className="grid size-7 place-items-center rounded-md bg-info/10 text-info">
						<Cpu aria-hidden className="size-3.5" />
					</span>
				}
				meta={
					<span className="flex flex-col items-end gap-0.5">
						<span className="font-mono text-base-content/60 text-xs">
							{truncatedPeerId}
						</span>
						{bot.lastAcked ? (
							<span className="text-base-content/40 text-xs">
								{t({
									id: "bot-list.last-acked",
									defaultMessage: "Last acked {value}",
									values: { value: bot.lastAcked },
								})}
							</span>
						) : null}
					</span>
				}
				onClick={onSelect ? () => onSelect(bot.id) : undefined}
				primary={
					<span className="flex items-center gap-2">
						<span>
							{t({
								id: "bot-list.mention",
								defaultMessage: "@bot:{alias}",
								values: { alias: bot.alias },
							})}
						</span>
					</span>
				}
				status={<StatusPill status={bot.status} />}
				actions={
					onOverflow ? (
						<button
							aria-haspopup="menu"
							aria-label={t({
								id: "bot-list.more",
								defaultMessage: "More options",
							})}
							className="grid size-7 place-items-center rounded-md text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
							onClick={(event) => onOverflow(bot.id, event)}
							type="button"
						>
							<MoreHorizontal aria-hidden className="size-4" />
						</button>
					) : undefined
				}
				
			/>
			{bot.status === "failed" && bot.errorReason ? (
				<FailureRow
					message={bot.errorReason}
					onRetry={onRetry ? () => onRetry(bot.id) : undefined}
				/>
			) : null}
		</>
	);
}

function StatusPill({ status }: { status: BotStatus }) {
	const t = useT();
	if (status === "pending") {
		return (
			<Pill dot="pulse" tone="neutral">
				{t({
					id: "bot-list.status.pending",
					defaultMessage: "Pending",
				})}
			</Pill>
		);
	}
	if (status === "active") {
		return (
			<Pill dot tone="success">
				{t({
					id: "bot-list.status.active",
					defaultMessage: "Active",
				})}
			</Pill>
		);
	}
	if (status === "expired") {
		return (
			<Pill dot tone="warning">
				{t({
					id: "bot-list.status.expired",
					defaultMessage: "Expired",
				})}
			</Pill>
		);
	}
	return (
		<Pill dot tone="error">
			{t({
				id: "bot-list.status.failed",
				defaultMessage: "Failed",
			})}
		</Pill>
	);
}

function FailureRow({
	message,
	onRetry,
}: {
	message: ReactNode;
	onRetry?: () => void;
}) {
	const t = useT();
	// Renders as its own <li> sibling under the parent <ul class="list"> so it
	// gets the same divider treatment as the surrounding DenseRow rows.
	return (
		<li className="flex items-start gap-2 bg-error/5 px-3 py-2 text-sm">
			<AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-error" />
			<span className="min-w-0 flex-1 text-error">{message}</span>
			{onRetry ? (
				<button
					className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-error hover:bg-error/10"
					onClick={onRetry}
					type="button"
				>
					<RotateCw aria-hidden className="size-3.5" />
					{t({ id: "bot-list.retry", defaultMessage: "Retry" })}
				</button>
			) : null}
		</li>
	);
}

function useTruncatedPeerId(peerId: string): string {
	// libp2p peer ids are typically ~50 chars. Show first 4 + last 4 with
	// ellipsis between, like `12D3…Cd34`.
	if (peerId.length <= 9) return peerId;
	return `${peerId.slice(0, 4)}…${peerId.slice(-4)}`;
}
