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
import { type ReactNode } from "react";
import { AlertTriangle, Cpu, MoreHorizontal, RotateCw } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { DenseRow } from "./dense-row";
import { Empty } from "../primitives/empty";
import { Pill } from "../primitives/pill";

export type BotStatus = "pending" | "active" | "failed";

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
	onRemove?: (id: string) => void;
	onAddBot?: () => void;
	className?: string;
};

export function BotList({
	bots,
	onSelect,
	onRetry,
	onRemove,
	onAddBot,
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
		<div className={cn("flex flex-col divide-y divide-base-300", className)}>
			{bots.map((bot) => (
				<BotEntry
					bot={bot}
					key={bot.id}
					onRemove={onRemove}
					onRetry={onRetry}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}

function BotEntry({
	bot,
	onSelect,
	onRetry,
	onRemove,
}: {
	bot: Bot;
	onSelect?: (id: string) => void;
	onRetry?: (id: string) => void;
	onRemove?: (id: string) => void;
}) {
	const t = useT();
	const truncatedPeerId = useTruncatedPeerId(bot.peerId);
	return (
		<div className="flex flex-col">
			<DenseRow
				leading={
					<span className="grid size-7 place-items-center rounded-md bg-info/10 text-info">
						<Cpu aria-hidden className="size-3.5" />
					</span>
				}
				meta={
					<span className="flex flex-col items-end gap-0.5">
						<span className="font-mono text-base-content/60 text-ui-xs">
							{truncatedPeerId}
						</span>
						{bot.lastAcked ? (
							<span className="text-base-content/40 text-ui-xs">
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
						<span>@bot:{bot.alias}</span>
					</span>
				}
				status={<StatusPill status={bot.status} />}
				actions={
					onRemove ? (
						<button
							aria-label={t({
								id: "bot-list.remove",
								defaultMessage: "Remove bot",
							})}
							className="grid size-7 place-items-center rounded-md text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
							onClick={() => onRemove(bot.id)}
							type="button"
						>
							<MoreHorizontal aria-hidden className="size-4" />
						</button>
					) : undefined
				}
				tier="avatar"
			/>
			{bot.status === "failed" && bot.errorReason ? (
				<FailureRow
					message={bot.errorReason}
					onRetry={onRetry ? () => onRetry(bot.id) : undefined}
				/>
			) : null}
		</div>
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
	return (
		<div className="flex items-start gap-2 bg-error/5 px-3 py-2 text-ui-sm">
			<AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-error" />
			<span className="min-w-0 flex-1 text-error">{message}</span>
			{onRetry ? (
				<button
					className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-error transition-colors hover:bg-error/10"
					onClick={onRetry}
					type="button"
				>
					<RotateCw aria-hidden className="size-3.5" />
					{t({ id: "bot-list.retry", defaultMessage: "Retry" })}
				</button>
			) : null}
		</div>
	);
}

function useTruncatedPeerId(peerId: string): string {
	// libp2p peer ids are typically ~50 chars. Show first 4 + last 4 with
	// ellipsis between, like `12D3…Cd34`.
	if (peerId.length <= 9) return peerId;
	return `${peerId.slice(0, 4)}…${peerId.slice(-4)}`;
}
