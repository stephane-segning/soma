/**
 * InvitesTab — `spaces/:spaceId/settings` "Invites" tab body.
 *
 * Mirrors `BotsTab`'s shape exactly (`SectionCard` header action toggles
 * an inline create form; `InlineSlugConfirm` handles the destructive
 * revoke path) rather than inventing a new layout — this is the same
 * "one CTA opens an inline form, the roster is a `DenseRow` list" grammar
 * `MembersTab`/`BotsTab` already established for this screen.
 *
 * No client-side owner pre-check (unlike `AssistantTab`'s read-only
 * gate): `backend.invites.create`/`revoke` are owner-only server-side,
 * but so are `spaces.revokeMember`/`revokeBot`/`issueIssuerCapability`,
 * and neither `MembersTab` nor `BotsTab` pre-checks ownership either —
 * both just let the server reject and surface the failure inline
 * (ADR-0005 §6). Matching that is more consistent than special-casing
 * this one tab, and avoids an extra `spaces.get` + `daemon.status`
 * round-trip this tab doesn't otherwise need.
 *
 * The invite link itself is never hidden behind a reveal toggle
 * (`SecretInput`): unlike an API key, a link is meant to be copied and
 * handed to someone else *immediately* — masking it by default would
 * add friction to the row's whole purpose. See `CopyLinkButton` below,
 * which mirrors `routes/settings.tsx`'s `AccountSection` peer-id copy
 * button (`btn btn-ghost btn-xs`, toggling Copy/Copied) rather than
 * `@soma/ui`'s icon-only `capability-form.tsx` copy button, for
 * consistency with the rest of this app.
 */
import type { CreateInviteArgs, StoredInvite } from "@soma/sdk";
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import { DenseRow } from "@soma/ui/components/lists/dense-row";
import { Empty } from "@soma/ui/components/primitives/empty";
import { Pill, type PillTone } from "@soma/ui/components/primitives/pill";
import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { backend } from "../../lib/backend";
import {
	describeInviteExpiry,
	describeInviteLifecycle,
	describeRedemption,
	INVITE_ASSIGNABLE_ROLES,
	INVITE_DEFAULT_ROLE,
	INVITE_TTL_PRESETS,
	type InviteLifecycle,
	type InviteTtlPreset,
	inviteConfirmSlug,
	inviteTtlPresetToSeconds,
	isInviteLive,
} from "../../lib/invites";
import { normalizeRoleSlug, type SpaceRoleSlug } from "../../lib/space-settings";
import { InlineSlugConfirm } from "./inline-slug-confirm";
import { SectionCard } from "./section-card";

type LoadState =
	| { phase: "loading" }
	| { phase: "error"; message: string }
	| { phase: "ready"; invites: StoredInvite[] };

export function InvitesTab({ spaceId }: { spaceId: string }) {
	const { t } = useTranslation();
	const [state, setState] = useState<LoadState>({ phase: "loading" });
	const [reloadToken, setReloadToken] = useState(0);
	const [creating, setCreating] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `reloadToken` is a deliberate re-run trigger (bumped after create/revoke) — it isn't read inside the effect body.
	useEffect(() => {
		let cancelled = false;
		setState({ phase: "loading" });
		(async () => {
			try {
				const invites = await backend.invites.list(spaceId);
				if (cancelled) return;
				setState({ phase: "ready", invites });
			} catch (err) {
				if (cancelled) return;
				setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spaceId, reloadToken]);

	const reload = useCallback(() => setReloadToken((n) => n + 1), []);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	if (state.phase === "loading") {
		return <Empty headline={t("spaceSettings.invites.loading")} variant="compact" />;
	}
	if (state.phase === "error") {
		return <Empty headline={t("spaceSettings.invites.error", { message: state.message })} />;
	}

	return (
		<SectionCard
			actions={
				creating ? null : (
					<PolymorphButton onClick={openCreate} size="sm" type="button" variant="primary">
						{t("spaceSettings.invites.create.cta")}
					</PolymorphButton>
				)
			}
			description={t("spaceSettings.invites.description")}
			title={t("spaceSettings.invites.title")}
		>
			<div className="flex flex-col gap-6">
				{creating ? (
					<CreateInviteForm
						onCancel={closeCreate}
						onCreated={() => {
							closeCreate();
							reload();
						}}
						spaceId={spaceId}
					/>
				) : null}
				<InviteRoster invites={state.invites} onRevoked={reload} spaceId={spaceId} />
			</div>
		</SectionCard>
	);
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateInviteForm({
	spaceId,
	onCancel,
	onCreated,
}: {
	spaceId: string;
	onCancel: () => void;
	onCreated: (invite: StoredInvite) => void;
}) {
	const { t } = useTranslation();
	const [role, setRole] = useState<SpaceRoleSlug>(INVITE_DEFAULT_ROLE);
	const [ttlPreset, setTtlPreset] = useState<InviteTtlPreset>("7d");
	const [label, setLabel] = useState("");
	const [multiUse, setMultiUse] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const roleId = useId();
	const labelId = useId();

	const handleCreate = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			const args: CreateInviteArgs = {
				spaceId,
				role,
				ttlSecs: inviteTtlPresetToSeconds(ttlPreset),
				label: label.trim() || undefined,
				multiUse,
			};
			const invite = await backend.invites.create(args);
			setBusy(false);
			onCreated(invite);
		} catch (err) {
			setBusy(false);
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [spaceId, role, ttlPreset, label, multiUse, onCreated]);

	return (
		<form
			className="surface-card flex flex-col gap-3 p-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (!busy) void handleCreate();
			}}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<label className="text-base-content/60 text-xs" htmlFor={roleId}>
						{t("spaceSettings.invites.create.role.label")}
					</label>
					<select
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
						id={roleId}
						onChange={(event) => setRole(event.target.value as SpaceRoleSlug)}
						value={role}
					>
						{INVITE_ASSIGNABLE_ROLES.map((slug) => (
							<option key={slug} value={slug}>
								{t(`spaceSettings.roles.${slug}`)}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-base-content/60 text-xs" htmlFor={labelId}>
						{t("spaceSettings.invites.create.label.label")}
					</label>
					<input
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
						id={labelId}
						maxLength={80}
						onChange={(event) => setLabel(event.target.value)}
						placeholder={t("spaceSettings.invites.create.label.placeholder")}
						type="text"
						value={label}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-base-content/60 text-xs">{t("spaceSettings.invites.create.ttl.label")}</span>
				<div className="flex flex-wrap gap-2">
					{INVITE_TTL_PRESETS.map((preset) => {
						const active = preset === ttlPreset;
						return (
							<button
								aria-pressed={active}
								className={`rounded-md border px-2 py-1 text-xs transition-colors ${
									active
										? "border-primary/40 bg-primary/15 text-primary"
										: "border-base-300 text-base-content/80 hover:bg-base-200"
								}`}
								key={preset}
								onClick={() => setTtlPreset(preset)}
								type="button"
							>
								{t(`spaceSettings.invites.create.ttl.presets.${preset}`)}
							</button>
						);
					})}
				</div>
			</div>

			<label className="flex items-center gap-2 text-sm">
				<input
					checked={multiUse}
					className="checkbox checkbox-sm"
					onChange={(event) => setMultiUse(event.target.checked)}
					type="checkbox"
				/>
				{t("spaceSettings.invites.create.multiUse.label")}
			</label>

			{error ? <p className="text-error text-xs">{error}</p> : null}

			<div className="flex items-center justify-end gap-2">
				<PolymorphButton disabled={busy} onClick={onCancel} size="sm" type="button" variant="ghost">
					{t("spaceSettings.invites.create.cancel")}
				</PolymorphButton>
				<PolymorphButton disabled={busy} loading={busy} size="sm" type="submit" variant="primary">
					{busy ? t("spaceSettings.invites.create.submitting") : t("spaceSettings.invites.create.submit")}
				</PolymorphButton>
			</div>
		</form>
	);
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const LIFECYCLE_TONE: Record<InviteLifecycle, PillTone> = {
	active: "success",
	exhausted: "neutral",
	expired: "warning",
	revoked: "error",
};

function InviteRoster({
	invites,
	spaceId,
	onRevoked,
}: {
	invites: StoredInvite[];
	spaceId: string;
	onRevoked: () => void;
}) {
	const { t } = useTranslation();
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const revokingInvite = revokingId ? invites.find((invite) => invite.id === revokingId) : undefined;

	const handleRevoke = useCallback(async () => {
		if (!revokingId) return;
		setBusy(true);
		setError(null);
		try {
			await backend.invites.revoke({ spaceId, id: revokingId });
			setBusy(false);
			setRevokingId(null);
			onRevoked();
		} catch (err) {
			setBusy(false);
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [revokingId, spaceId, onRevoked]);

	if (invites.length === 0) {
		return <Empty headline={t("spaceSettings.invites.roster.empty")} variant="compact" />;
	}

	return (
		<div className="flex flex-col gap-3">
			{/* Quiet, once-per-list disclosure rather than repeated per row
			    (every `CopyLinkButton` below shares it): a `StoredInvite.link`
			    embeds the issuer's current listen addresses
			    (`bootstrapMultiaddrs`, baked in at creation — see
			    `soma-daemon::create_invite`), so copying and sharing a link
			    also shares those addresses. Not a scary warning — a link is
			    supposed to be shared — just enough for the owner to think
			    about *where* before pasting it into a public channel. */}
			<p className="text-base-content/50 text-xs">{t("spaceSettings.invites.roster.addressNote")}</p>
			<ul className="list list-dense bg-base-100">
				{invites.map((invite) => (
					<InviteRow
						invite={invite}
						key={invite.id}
						onArm={() => {
							setError(null);
							setRevokingId(invite.id);
						}}
					/>
				))}
			</ul>
			{revokingInvite ? (
				<InlineSlugConfirm
					busy={busy}
					cancelLabel={t("spaceSettings.invites.revokeConfirm.cancel")}
					confirmLabel={t("spaceSettings.invites.revokeConfirm.confirm")}
					description={t("spaceSettings.invites.revokeConfirm.description")}
					error={error}
					expectedSlug={inviteConfirmSlug(revokingInvite)}
					onCancel={() => {
						setRevokingId(null);
						setError(null);
					}}
					onConfirm={() => void handleRevoke()}
					slugLabel={t("spaceSettings.invites.revokeConfirm.slugLabel", { slug: inviteConfirmSlug(revokingInvite) })}
					title={t("spaceSettings.invites.revokeConfirm.title")}
				/>
			) : null}
		</div>
	);
}

function InviteRow({ invite, onArm }: { invite: StoredInvite; onArm: () => void }) {
	const { t } = useTranslation();
	const lifecycle = describeInviteLifecycle(invite);
	const expiry = describeInviteExpiry(invite.expiresAt);
	const redemption = describeRedemption(invite);
	const roleSlug = normalizeRoleSlug(invite.role);
	const roleLabel = t(`spaceSettings.roles.${roleSlug}`);
	const label = invite.label.trim();

	const redemptionText =
		redemption.kind === "unused"
			? t("spaceSettings.invites.roster.unused")
			: redemption.kind === "exhausted"
				? t("spaceSettings.invites.roster.exhausted")
				: t("spaceSettings.invites.roster.redeemed", { count: redemption.count });

	return (
		<DenseRow
			actions={
				<div className="flex items-center gap-1">
					<CopyLinkButton disabled={!isInviteLive(invite)} link={invite.link} />
					{lifecycle !== "revoked" ? (
						<button
							className="rounded-md px-2 py-1 text-error/80 text-xs hover:bg-error/10 hover:text-error"
							onClick={onArm}
							type="button"
						>
							{t("spaceSettings.invites.roster.revoke")}
						</button>
					) : null}
				</div>
			}
			meta={
				expiry.kind === "never"
					? t("spaceSettings.invites.roster.expiry.never")
					: expiry.kind === "expired"
						? t("spaceSettings.invites.roster.expiry.expired", { date: expiry.date.toLocaleDateString() })
						: t("spaceSettings.invites.roster.expiry.active", { date: expiry.date.toLocaleDateString() })
			}
			primary={label || t("spaceSettings.invites.roster.unlabeled", { role: roleLabel })}
			status={
				<Pill dot={lifecycle === "active" ? true : undefined} tone={LIFECYCLE_TONE[lifecycle]}>
					{t(`spaceSettings.invites.roster.status.${lifecycle}`)}
				</Pill>
			}
			sub={`${roleLabel} · ${redemptionText}`}
		/>
	);
}

function CopyLinkButton({ link, disabled }: { link: string; disabled?: boolean }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	const copy = useCallback(() => {
		navigator.clipboard.writeText(link).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [link]);

	return (
		<button className="btn btn-ghost btn-xs" disabled={disabled} onClick={copy} type="button">
			{copied ? t("spaceSettings.invites.roster.copied") : t("spaceSettings.invites.roster.copy")}
		</button>
	);
}
