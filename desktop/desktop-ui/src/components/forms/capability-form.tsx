/**
 * CapabilityForm — step 2 of the §4.4 bot-add flow.
 *
 * Locked by [refs main §4](../../../../../docs/src/architecture/prd/ui-revamp-v0-refs.md)
 * step 2 ("Appwrite-style scoped cards on one scroll surface").
 *
 * Surface stack:
 *  1. **Identity** — read-only peer id + editable alias used in
 *     `@bot:<alias>` mentions.
 *  2. **Scopes** — collapsible groups (Documents / Messages /
 *     Attachments / Membership / …) with `n of m granted` count;
 *     expand to see per-scope checkboxes.
 *  3. **Expiry** — date picker + quick presets (7d / 30d / 90d /
 *     never).
 *  4. **Issue** — primary action; error renders inline above the
 *     button (no toast, per ADR-0005 §6).
 *
 * The form is **controlled**: caller owns `value` and `onChange`.
 * That keeps validation + persistence on the caller's side; this
 * component only renders.
 */
import { type ChangeEvent, type ReactNode, useId, useState } from "react";
import { AlertCircle, ChevronDown, Copy } from "react-feather";
import { useT } from "../../i18n/use-t";
import { cn } from "../../utils/cn";
import { Pill } from "../primitives/pill";

export type Scope = {
	id: string;
	label: string;
	description?: string;
};

export type ScopeGroup = {
	id: string;
	label: string;
	scopes: Scope[];
};

export type ExpiryPreset = "7d" | "30d" | "90d" | "never";

export type CapabilityFormValue = {
	alias: string;
	/** Ids of granted scopes (flat — across all groups). */
	grantedScopeIds: string[];
	/** ISO date string for explicit dates, or `null` for "never". */
	expiryDate: string | null;
};

export type CapabilityFormProps = {
	peerId: string;
	scopeGroups: ScopeGroup[];
	value: CapabilityFormValue;
	onChange: (next: CapabilityFormValue) => void;
	onIssue: () => void;
	onCancel?: () => void;
	/** Disables the issue button + shows a spinner while the daemon handshake runs. */
	issuing?: boolean;
	/** Render inline above the Issue button. No toast. */
	issueError?: string;
	className?: string;
};

const PRESETS: ExpiryPreset[] = ["7d", "30d", "90d", "never"];

export function CapabilityForm({
	peerId,
	scopeGroups,
	value,
	onChange,
	onIssue,
	onCancel,
	issuing,
	issueError,
	className,
}: CapabilityFormProps) {
	const t = useT();

	const totalScopes = scopeGroups.reduce(
		(sum, group) => sum + group.scopes.length,
		0,
	);
	const totalGranted = value.grantedScopeIds.length;

	function patch(next: Partial<CapabilityFormValue>) {
		onChange({ ...value, ...next });
	}

	return (
		<form
			className={cn("flex flex-col gap-3", className)}
			onSubmit={(event) => {
				event.preventDefault();
				if (!issuing) onIssue();
			}}
		>
			<IdentityCard
				alias={value.alias}
				onAliasChange={(alias) => patch({ alias })}
				peerId={peerId}
			/>

			<ScopesCard
				grantedScopeIds={value.grantedScopeIds}
				onChange={(grantedScopeIds) => patch({ grantedScopeIds })}
				scopeGroups={scopeGroups}
				totalGranted={totalGranted}
				totalScopes={totalScopes}
			/>

			<ExpiryCard
				onChange={(expiryDate) => patch({ expiryDate })}
				value={value.expiryDate}
			/>

			<div className="flex flex-col gap-2">
				{issueError ? (
					<div className="flex items-start gap-2 rounded-md border border-error/40 bg-error/5 px-3 py-2 text-error text-ui-sm">
						<AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
						<span className="min-w-0 flex-1">{issueError}</span>
					</div>
				) : null}
				<div className="flex items-center justify-end gap-2">
					{onCancel ? (
						<button
							className="btn btn-ghost btn-sm"
							disabled={issuing}
							onClick={onCancel}
							type="button"
						>
							{t({ id: "capability-form.cancel", defaultMessage: "Cancel" })}
						</button>
					) : null}
					<button
						className="btn btn-primary btn-sm"
						disabled={issuing || value.alias.trim().length === 0}
						type="submit"
					>
						{issuing
							? t({
									id: "capability-form.issuing",
									defaultMessage: "Issuing…",
								})
							: t({
									id: "capability-form.issue",
									defaultMessage: "Issue capability",
								})}
					</button>
				</div>
			</div>
		</form>
	);
}

function Card({
	title,
	children,
}: {
	title: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="surface-card flex flex-col gap-3 p-3">
			<header className="flex items-center justify-between gap-2">
				<h3 className="font-medium text-base-content/90 text-ui-sm">
					{title}
				</h3>
			</header>
			{children}
		</section>
	);
}

function IdentityCard({
	peerId,
	alias,
	onAliasChange,
}: {
	peerId: string;
	alias: string;
	onAliasChange: (next: string) => void;
}) {
	const t = useT();
	const aliasId = useId();
	const peerIdId = useId();
	return (
		<Card
			title={t({
				id: "capability-form.identity.title",
				defaultMessage: "Identity",
			})}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<label className="text-base-content/60 text-ui-xs" htmlFor={peerIdId}>
						{t({
							id: "capability-form.identity.peer-id",
							defaultMessage: "Peer id",
						})}
					</label>
					<div className="flex items-center gap-1 rounded-md border border-base-300 bg-base-200 px-2 py-1.5 font-mono text-ui-xs">
						<span className="min-w-0 flex-1 truncate" id={peerIdId}>
							{peerId}
						</span>
						<CopyButton value={peerId} />
					</div>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-base-content/60 text-ui-xs" htmlFor={aliasId}>
						{t({
							id: "capability-form.identity.alias",
							defaultMessage: "Alias",
						})}
					</label>
					<input
						aria-describedby={`${aliasId}-help`}
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1.5 font-mono text-body outline-none focus-visible:border-primary"
						id={aliasId}
						onChange={(event) => onAliasChange(event.target.value)}
						placeholder={t({
							id: "capability-form.identity.alias-placeholder",
							defaultMessage: "my-bot",
						})}
						spellCheck={false}
						type="text"
						value={alias}
					/>
					<span
						className="text-base-content/50 text-ui-xs"
						id={`${aliasId}-help`}
					>
						{t({
							id: "capability-form.identity.alias-help",
							defaultMessage: "Used as @bot:<alias> in mentions.",
						})}
					</span>
				</div>
			</div>
		</Card>
	);
}

function CopyButton({ value }: { value: string }) {
	const t = useT();
	const [copied, setCopied] = useState(false);
	return (
		<button
			aria-label={t({
				id: "capability-form.copy",
				defaultMessage: "Copy",
			})}
			className="inline-flex size-6 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-300 hover:text-base-content"
			onClick={() => {
				navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
			title={
				copied
					? t({ id: "capability-form.copied", defaultMessage: "Copied!" })
					: undefined
			}
			type="button"
		>
			<Copy aria-hidden className="size-3" />
		</button>
	);
}

function ScopesCard({
	scopeGroups,
	grantedScopeIds,
	totalScopes,
	totalGranted,
	onChange,
}: {
	scopeGroups: ScopeGroup[];
	grantedScopeIds: string[];
	totalScopes: number;
	totalGranted: number;
	onChange: (next: string[]) => void;
}) {
	const t = useT();

	function toggle(scopeId: string) {
		if (grantedScopeIds.includes(scopeId)) {
			onChange(grantedScopeIds.filter((id) => id !== scopeId));
		} else {
			onChange([...grantedScopeIds, scopeId]);
		}
	}

	return (
		<Card
			title={
				<span className="flex items-center gap-2">
					{t({
						id: "capability-form.scopes.title",
						defaultMessage: "Scopes",
					})}
					<Pill tone="neutral">
						{t({
							id: "capability-form.scopes.count",
							defaultMessage: "{granted} of {total} granted",
							values: { granted: totalGranted, total: totalScopes },
						})}
					</Pill>
				</span>
			}
		>
			<div className="flex flex-col gap-2">
				{scopeGroups.map((group) => (
					<ScopeGroupBlock
						grantedScopeIds={grantedScopeIds}
						group={group}
						key={group.id}
						onToggle={toggle}
					/>
				))}
			</div>
		</Card>
	);
}

function ScopeGroupBlock({
	group,
	grantedScopeIds,
	onToggle,
}: {
	group: ScopeGroup;
	grantedScopeIds: string[];
	onToggle: (scopeId: string) => void;
}) {
	const t = useT();
	const [open, setOpen] = useState(false);
	const grantedInGroup = group.scopes.filter((s) =>
		grantedScopeIds.includes(s.id),
	).length;
	return (
		<div className="rounded-md border border-base-300">
			<button
				aria-expanded={open}
				className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-ui-sm transition-colors hover:bg-base-200"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<span className="font-medium text-base-content/90">{group.label}</span>
				<span className="flex items-center gap-2">
					<span className="text-base-content/60 text-ui-xs">
						{t({
							id: "capability-form.scopes.group-count",
							defaultMessage: "{granted}/{total}",
							values: { granted: grantedInGroup, total: group.scopes.length },
						})}
					</span>
					<ChevronDown
						aria-hidden
						className={cn(
							"size-4 text-base-content/40 transition-transform",
							open && "rotate-180",
						)}
					/>
				</span>
			</button>
			{open ? (
				<ul className="flex flex-col gap-1 border-base-300 border-t p-2">
					{group.scopes.map((scope) => (
						<li key={scope.id}>
							<label className="flex items-start gap-2 rounded-md px-2 py-1 text-ui-sm transition-colors hover:bg-base-200">
								<input
									checked={grantedScopeIds.includes(scope.id)}
									className="checkbox checkbox-sm mt-0.5"
									onChange={() => onToggle(scope.id)}
									type="checkbox"
								/>
								<span className="flex min-w-0 flex-col">
									<span className="text-base-content/90">{scope.label}</span>
									{scope.description ? (
										<span className="text-base-content/60 text-ui-xs">
											{scope.description}
										</span>
									) : null}
								</span>
							</label>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function ExpiryCard({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (next: string | null) => void;
}) {
	const t = useT();
	const dateId = useId();

	function applyPreset(preset: ExpiryPreset) {
		if (preset === "never") {
			onChange(null);
			return;
		}
		const now = new Date();
		const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
		now.setDate(now.getDate() + days);
		// Use local-time methods rather than `toISOString().slice(0, 10)`.
		// `toISOString` returns UTC, so a user in a non-UTC timezone would
		// see the calendar day off by one near midnight.
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		onChange(`${year}-${month}-${day}`);
	}

	const activePreset = inferPreset(value);

	function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
		onChange(event.target.value || null);
	}

	const presetLabel: Record<ExpiryPreset, string> = {
		"7d": t({
			id: "capability-form.expiry.preset.7d",
			defaultMessage: "7 days",
		}),
		"30d": t({
			id: "capability-form.expiry.preset.30d",
			defaultMessage: "30 days",
		}),
		"90d": t({
			id: "capability-form.expiry.preset.90d",
			defaultMessage: "90 days",
		}),
		never: t({
			id: "capability-form.expiry.preset.never",
			defaultMessage: "Never",
		}),
	};

	return (
		<Card
			title={t({
				id: "capability-form.expiry.title",
				defaultMessage: "Expiry",
			})}
		>
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap gap-2">
					{PRESETS.map((preset) => {
						const active = preset === activePreset;
						return (
							<button
								aria-pressed={active}
								className={cn(
									"rounded-md border px-2 py-1 text-ui-xs transition-colors",
									active
										? "border-primary/40 bg-primary/15 text-primary"
										: "border-base-300 text-base-content/80 hover:bg-base-200",
								)}
								key={preset}
								onClick={() => applyPreset(preset)}
								type="button"
							>
								{presetLabel[preset]}
							</button>
						);
					})}
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-base-content/60 text-ui-xs" htmlFor={dateId}>
						{t({
							id: "capability-form.expiry.exact",
							defaultMessage: "Exact date",
						})}
					</label>
					{/* The date input stays enabled even when the current
					    value is `null` / "Never" — picking a date there is
					    a valid way to leave the Never state. Clearing the
					    input commits as `null` again. */}
					<input
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-body outline-none focus-visible:border-primary"
						id={dateId}
						onChange={handleDateChange}
						type="date"
						value={value ?? ""}
					/>
				</div>
			</div>
		</Card>
	);
}

function inferPreset(value: string | null): ExpiryPreset | null {
	if (value === null) return "never";
	// Don't try to infer 7d/30d/90d from a date string — only "never"
	// has a stable mapping. Other dates render as a custom date.
	return null;
}
