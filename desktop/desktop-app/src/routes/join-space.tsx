/**
 * JoinSpacePage — `/join`. The invitee-side redeem flow for a
 * `soma://invite/...` link (paste-in entry point: `SpacesIndex`'s CTA,
 * the command palette's "Join a space", or a deep link routed here by
 * `components/deep-link/deep-link-listener.tsx` with the link
 * pre-filled via router `state`).
 *
 * Flow is strictly ordered: `backend.invites.inspect()` (offline,
 * zero-network — safe to run before any confirmation) runs first and
 * ALWAYS produces the confirmation panel below; `backend.invites.redeem()`
 * (which dials the issuer) only ever runs after the user explicitly
 * confirms, and only when `isInviteAcceptable(inspection)` — i.e.
 * `validity === "valid"` — is true.
 *
 * Security framing (see `lib/invites.ts`'s trust section doc comment):
 * `InviteInspection` still populates its fields when
 * `validity === "invalidSignature"` — they're what the link *claims*,
 * not what was verified. This screen never renders those as if they
 * were facts: `inviteFieldTrust` drives a visible "claimed, unverified"
 * caption and tinted field values, and the Join action stays disabled
 * for anything but `"valid"` regardless of what the fields show.
 *
 * No toast anywhere in this flow (ADR-0005 §6) — every phase (inspecting,
 * rejected, submitting, pending, decided, dial-failed) renders inline in
 * this same screen.
 */
import type { DomainEvent, InviteInspection, InviteValidity, RedeemInviteArgs } from "@soma/sdk";
import { PolymorphButton } from "@soma/ui/components/actions/polymorph-button";
import { Empty } from "@soma/ui/components/primitives/empty";
import { Pill, type PillTone } from "@soma/ui/components/primitives/pill";
import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { backend } from "../lib/backend";
import {
	describeInspectionExpiry,
	describeJoinDecision,
	inviteFieldTrust,
	isInviteAcceptable,
	type JoinDecisionOutcome,
	type JoinSpaceNavigationState,
} from "../lib/invites";
import { normalizeRoleSlug } from "../lib/space-settings";

type InspectPhase =
	| { phase: "editing" }
	| { phase: "inspecting" }
	| { phase: "inspected"; result: InviteInspection }
	| { phase: "inspectError"; message: string };

type RedeemPhase =
	| { phase: "idle" }
	| { phase: "submitting" }
	| { phase: "pending"; requestId: string }
	| { phase: "decided"; outcome: JoinDecisionOutcome; reason: string }
	| { phase: "dialFailed"; message: string }
	| { phase: "error"; message: string };

export function JoinSpacePage() {
	const { t } = useTranslation();
	const location = useLocation();
	const navigate = useNavigate();

	const [link, setLink] = useState("");
	const [inspect, setInspect] = useState<InspectPhase>({ phase: "editing" });
	const [redeem, setRedeem] = useState<RedeemPhase>({ phase: "idle" });
	const [displayName, setDisplayName] = useState("");
	const [deviceName, setDeviceName] = useState("");

	const runInspect = useCallback(async (candidate: string) => {
		const trimmed = candidate.trim();
		if (!trimmed) {
			setInspect({ phase: "editing" });
			return;
		}
		setInspect({ phase: "inspecting" });
		try {
			const result = await backend.invites.inspect(trimmed);
			setInspect({ phase: "inspected", result });
		} catch (err) {
			setInspect({ phase: "inspectError", message: err instanceof Error ? err.message : String(err) });
		}
	}, []);

	// Deep-link handoff. `location.state` is a fresh object per
	// `navigate(..., {state})` call even when the path repeats (see
	// `use-navigation-notice.ts`'s doc comment for the same fact used the
	// same way), so this fires both on first mount AND if a second
	// invite link arrives while already here — either way the field is
	// pre-filled and inspected immediately, since `inspect()` is offline
	// and safe before any confirmation.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `runInspect` is a stable useCallback with no reactive inputs of its own; adding it would re-run this on every render for no reason.
	useEffect(() => {
		const state = location.state as JoinSpaceNavigationState | null | undefined;
		const incoming = state?.link;
		if (!incoming) return;
		setLink(incoming);
		setRedeem({ phase: "idle" });
		void runInspect(incoming);
	}, [location.state]);

	const handleLinkChange = useCallback((next: string) => {
		setLink(next);
		// Any manual edit invalidates whatever was inspected before — never
		// let a stale confirmation linger over a link the user has since
		// changed.
		setInspect({ phase: "editing" });
		setRedeem({ phase: "idle" });
	}, []);

	const handleBlur = useCallback(() => {
		void runInspect(link);
	}, [link, runInspect]);

	const reset = useCallback(() => {
		setLink("");
		setInspect({ phase: "editing" });
		setRedeem({ phase: "idle" });
	}, []);

	const inspection = inspect.phase === "inspected" ? inspect.result : null;
	// THE gate — see `isInviteAcceptable`'s doc comment. Never substitute
	// "are spaceId/role/etc. non-null" for this check.
	const acceptable = inspection !== null && isInviteAcceptable(inspection);

	const handleRedeem = useCallback(async () => {
		if (!inspection || !isInviteAcceptable(inspection)) return;
		setRedeem({ phase: "submitting" });
		try {
			const args: RedeemInviteArgs = {
				link: link.trim(),
				displayName: displayName.trim() || undefined,
				deviceName: deviceName.trim() || undefined,
			};
			const result = await backend.invites.redeem(args);
			setRedeem({ phase: "pending", requestId: result.requestId });
		} catch (err) {
			setRedeem({ phase: "error", message: err instanceof Error ? err.message : String(err) });
		}
	}, [inspection, link, displayName, deviceName]);

	// While a request is pending, listen for the eventual decision (or a
	// failure to even reach the issuer) so the screen doesn't dead-end at
	// "request sent" — mirrors how `spaces-rail-container.tsx` /
	// `command-palette-root.tsx` already react to `join-decision`, just
	// scoped to the one space/issuer this screen cares about.
	useEffect(() => {
		if (redeem.phase !== "pending" || !inspection) return;
		const targetSpaceId = inspection.spaceId;
		const targetIssuerPeerId = inspection.issuerPeerId;
		const unsubscribe = backend.events.onDomain((event: DomainEvent) => {
			if (event.kind === "join-decision" && targetSpaceId && event.spaceId === targetSpaceId) {
				setRedeem({ phase: "decided", outcome: describeJoinDecision(event.decision), reason: event.reason });
			} else if (event.kind === "join-failed" && targetIssuerPeerId && event.targetPeerId === targetIssuerPeerId) {
				setRedeem({ phase: "dialFailed", message: event.error });
			}
		});
		return unsubscribe;
	}, [redeem.phase, inspection]);

	const openSpace = useCallback(() => {
		if (inspection?.spaceId) void navigate(`/spaces/${inspection.spaceId}`);
	}, [inspection, navigate]);

	const busy = redeem.phase === "submitting" || redeem.phase === "pending";

	return (
		<main className="mx-auto w-full max-w-2xl px-8 py-10">
			<header className="mb-6 flex flex-col gap-1">
				<h1 className="font-semibold text-2xl">{t("pages.join_space.title")}</h1>
				<p className="text-base-content/60 text-sm">{t("pages.join_space.subtitle")}</p>
			</header>

			<div className="flex flex-col gap-4">
				<LinkField disabled={busy} onBlur={handleBlur} onChange={handleLinkChange} value={link} />

				{inspect.phase === "inspecting" ? (
					<Empty headline={t("pages.join_space.inspecting")} variant="compact" />
				) : null}
				{inspect.phase === "inspectError" ? (
					<Empty headline={t("pages.join_space.inspectError", { message: inspect.message })} variant="compact" />
				) : null}

				{inspection ? <InviteConfirmation inspection={inspection} onTryDifferentLink={reset} /> : null}

				{inspection && acceptable && redeem.phase !== "pending" && redeem.phase !== "decided" ? (
					<RedeemForm
						busy={redeem.phase === "submitting"}
						deviceName={deviceName}
						displayName={displayName}
						error={
							redeem.phase === "error"
								? redeem.message
								: redeem.phase === "dialFailed"
									? t("pages.join_space.dialFailed", { message: redeem.message })
									: null
						}
						onDeviceNameChange={setDeviceName}
						onDisplayNameChange={setDisplayName}
						onSubmit={() => void handleRedeem()}
					/>
				) : null}

				{redeem.phase === "pending" ? (
					// Not an `Empty` here: this page has plenty else going on
					// (AGENTS.md — centered placards only when the screen
					// genuinely has nothing else to do), and the two-line
					// headline+body shape matches `DecidedPanel` below it, not
					// `Empty`'s `compact` variant (headline-only, no subtext).
					<div className="flex flex-col gap-1 rounded-md border border-info/30 bg-info/5 p-4">
						<p className="font-medium text-sm">{t("pages.join_space.submitted.headline")}</p>
						<p className="text-base-content/70 text-xs">{t("pages.join_space.submitted.body")}</p>
					</div>
				) : null}
				{redeem.phase === "decided" ? (
					<DecidedPanel
						onOpenSpace={openSpace}
						outcome={redeem.outcome}
						reason={redeem.reason}
						spaceLabel={inspection?.spaceLabel ?? inspection?.spaceId ?? undefined}
					/>
				) : null}
			</div>
		</main>
	);
}

// ---------------------------------------------------------------------------
// Link entry
// ---------------------------------------------------------------------------

function LinkField({
	value,
	onChange,
	onBlur,
	disabled,
}: {
	value: string;
	onChange: (next: string) => void;
	onBlur: () => void;
	disabled?: boolean;
}) {
	const { t } = useTranslation();
	const inputId = useId();
	return (
		<div className="flex flex-col gap-1">
			<label className="text-base-content/60 text-xs" htmlFor={inputId}>
				{t("pages.join_space.linkField.label")}
			</label>
			<input
				// biome-ignore lint/a11y/noAutofocus: this route's entire purpose is pasting a link — the field should be focused the moment it lands, same rationale `PeerAddressInput`'s callers use `autoFocus` for.
				autoFocus
				className="w-full rounded-md border border-base-300 bg-base-100 px-3 py-2 font-mono text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40"
				disabled={disabled}
				id={inputId}
				onBlur={onBlur}
				onChange={(event) => onChange(event.target.value)}
				placeholder={t("pages.join_space.linkField.placeholder")}
				spellCheck={false}
				type="text"
				value={value}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Confirmation panel
// ---------------------------------------------------------------------------

const TONE_CLASS: Record<InviteValidity, string> = {
	valid: "border-success/30 bg-success/5",
	expired: "border-warning/40 bg-warning/5",
	invalidSignature: "border-error/40 bg-error/5",
	malformed: "border-base-300 border-dashed",
};

const PILL_TONE: Record<InviteValidity, PillTone> = {
	valid: "success",
	expired: "warning",
	invalidSignature: "error",
	malformed: "neutral",
};

function InviteConfirmation({
	inspection,
	onTryDifferentLink,
}: {
	inspection: InviteInspection;
	onTryDifferentLink: () => void;
}) {
	const { t } = useTranslation();
	const { validity } = inspection;
	const trust = inviteFieldTrust(validity);
	const spaceLabel = inspection.spaceLabel ?? inspection.spaceId ?? undefined;
	const roleLabel = inspection.role ? t(`spaceSettings.roles.${normalizeRoleSlug(inspection.role)}`) : "—";
	const expiry = describeInspectionExpiry(inspection.expiresAt);
	const expiryText =
		expiry.kind === "never"
			? t("pages.join_space.expiry.never")
			: expiry.kind === "expired"
				? t("pages.join_space.expiry.expired", { date: expiry.date.toLocaleDateString() })
				: t("pages.join_space.expiry.active", { date: expiry.date.toLocaleDateString() });

	return (
		<div className={`flex flex-col gap-3 rounded-md border p-4 ${TONE_CLASS[validity]}`}>
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<p className="font-medium text-sm">
						{t(`pages.join_space.validity.${validity}.headline`, spaceLabel ? { space: spaceLabel } : undefined)}
					</p>
					<p className="text-base-content/70 text-xs">{t(`pages.join_space.validity.${validity}.body`)}</p>
				</div>
				<Pill tone={PILL_TONE[validity]}>{t(`pages.join_space.validity.${validity}.pill`)}</Pill>
			</div>

			{validity !== "malformed" ? (
				<div className="flex flex-col gap-2">
					{trust === "claimed" ? (
						<p className="font-medium text-error text-xs uppercase tracking-wide">
							{t("pages.join_space.validity.invalidSignature.claimsCaption")}
						</p>
					) : null}
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
						<FieldRow
							label={t("pages.join_space.fields.space")}
							muted={trust === "claimed"}
							value={spaceLabel ?? "—"}
						/>
						<FieldRow label={t("pages.join_space.fields.role")} muted={trust === "claimed"} value={roleLabel} />
						<FieldRow
							label={t("pages.join_space.fields.issuer")}
							mono
							muted={trust === "claimed"}
							value={inspection.issuerPeerId ?? "—"}
						/>
						<FieldRow label={t("pages.join_space.fields.expires")} muted={trust === "claimed"} value={expiryText} />
					</dl>
				</div>
			) : null}

			<div className="flex justify-end">
				<button className="btn btn-ghost btn-xs" onClick={onTryDifferentLink} type="button">
					{t("pages.join_space.tryDifferentLink")}
				</button>
			</div>
		</div>
	);
}

function FieldRow({ label, value, mono, muted }: { label: string; value: string; mono?: boolean; muted?: boolean }) {
	return (
		<>
			<dt className="text-base-content/50">{label}</dt>
			<dd className={`truncate ${mono ? "font-mono text-xs" : ""} ${muted ? "text-error/80" : "text-base-content/90"}`}>
				{value}
			</dd>
		</>
	);
}

// ---------------------------------------------------------------------------
// Redeem form
// ---------------------------------------------------------------------------

function RedeemForm({
	displayName,
	deviceName,
	busy,
	error,
	onDisplayNameChange,
	onDeviceNameChange,
	onSubmit,
}: {
	displayName: string;
	deviceName: string;
	busy: boolean;
	error: string | null;
	onDisplayNameChange: (next: string) => void;
	onDeviceNameChange: (next: string) => void;
	onSubmit: () => void;
}) {
	const { t } = useTranslation();
	const displayNameId = useId();
	const deviceNameId = useId();

	return (
		<form
			className="surface-card flex flex-col gap-3 p-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (!busy) onSubmit();
			}}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<label className="text-base-content/60 text-xs" htmlFor={displayNameId}>
						{t("pages.join_space.form.displayName.label")}
					</label>
					<input
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
						disabled={busy}
						id={displayNameId}
						onChange={(event) => onDisplayNameChange(event.target.value)}
						placeholder={t("pages.join_space.form.displayName.placeholder")}
						type="text"
						value={displayName}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-base-content/60 text-xs" htmlFor={deviceNameId}>
						{t("pages.join_space.form.deviceName.label")}
					</label>
					<input
						className="rounded-md border border-base-300 bg-base-100 px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
						disabled={busy}
						id={deviceNameId}
						onChange={(event) => onDeviceNameChange(event.target.value)}
						placeholder={t("pages.join_space.form.deviceName.placeholder")}
						type="text"
						value={deviceName}
					/>
				</div>
			</div>

			{error ? <p className="text-error text-xs">{error}</p> : null}

			<div className="flex justify-end">
				<PolymorphButton disabled={busy} loading={busy} size="sm" type="submit" variant="primary">
					{busy ? t("pages.join_space.form.submitting") : t("pages.join_space.form.submit")}
				</PolymorphButton>
			</div>
		</form>
	);
}

// ---------------------------------------------------------------------------
// Post-submit outcome
// ---------------------------------------------------------------------------

function DecidedPanel({
	outcome,
	reason,
	onOpenSpace,
	spaceLabel,
}: {
	outcome: JoinDecisionOutcome;
	reason: string;
	onOpenSpace: () => void;
	spaceLabel: string | undefined;
}) {
	const { t } = useTranslation();

	if (outcome === "approved") {
		return (
			<div className="flex flex-col gap-3 rounded-md border border-success/30 bg-success/5 p-4">
				<p className="font-medium text-sm">
					{t("pages.join_space.decided.approved", { space: spaceLabel ?? t("pages.join_space.decided.thisSpace") })}
				</p>
				<div className="flex justify-end">
					<PolymorphButton onClick={onOpenSpace} size="sm" type="button" variant="primary">
						{t("pages.join_space.decided.openSpace")}
					</PolymorphButton>
				</div>
			</div>
		);
	}

	const headline =
		outcome === "rejected"
			? t("pages.join_space.decided.rejected")
			: outcome === "blocked"
				? t("pages.join_space.decided.blocked")
				: t("pages.join_space.decided.unknown");

	return (
		<div className="flex flex-col gap-1 rounded-md border border-error/30 bg-error/5 p-4">
			<p className="font-medium text-sm">{headline}</p>
			{reason ? <p className="text-base-content/70 text-xs">{reason}</p> : null}
		</div>
	);
}
