/**
 * Pure domain logic for the invite flows — owner-side management
 * (`spaces/:spaceId/settings` Invites tab) and invitee-side redeem
 * (`routes/join-space.tsx`). Kept side-effect-free and framework-free,
 * same rationale as `lib/space-settings.ts`: unit-testable under plain
 * `vitest` (`environment: "node"`) rather than only exercised
 * indirectly through component tests.
 *
 * Every numeric/sentinel convention mirrored here comes from the Rust
 * side, not invented client-side — see each function's doc comment.
 */
import type { DeepLinkRoute, InviteInspection, InviteValidity, StoredInvite } from "@soma/sdk";
import { describeExpiry, type ExpiryStatus, type SpaceRoleSlug } from "./space-settings";

// ---------------------------------------------------------------------------
// Trust — THE gate for the redeem confirmation screen.
//
// `InviteInspection` populates `spaceId`/`spaceLabel`/`role`/`issuerPeerId`/
// `expiresAt`/`bootstrapMultiaddrs` even when `validity === "invalidSignature"`
// — those fields reflect what the link *claims*, not what was verified
// (see `InviteInspection.issuerPeerId`'s own doc comment in the generated
// bindings: "the UNVERIFIED claimed signer otherwise"). A confirmation
// screen that renders those fields whenever they're merely non-null would
// happily show an attacker-authored "you'll join as Owner" panel for a
// forged link. `validity === "valid"` must be the ONLY gate for the
// accept/Join affordance — never field presence.
// ---------------------------------------------------------------------------

/**
 * Whether the redeem confirmation screen may enable its "Join" action.
 * The single source of truth for that gate — see the module doc comment.
 */
export function isInviteAcceptable(inspection: Pick<InviteInspection, "validity">): boolean {
	return inspection.validity === "valid";
}

/** Whether the fields on an `InviteInspection` reflect verified facts, unverified claims, or nothing at all. */
export type InviteFieldTrust = "verified" | "claimed" | "none";

/**
 * `"valid"` and `"expired"` are both signature-valid (`InviteValidity`'s
 * own doc comment: expired is "decoded and signature-valid, but past its
 * expiry") — their fields are real. `"invalidSignature"` fields are
 * unverified claims only. `"malformed"` carries no fields at all (every
 * field is `null`/empty).
 */
export function inviteFieldTrust(validity: InviteValidity): InviteFieldTrust {
	if (validity === "valid" || validity === "expired") return "verified";
	if (validity === "invalidSignature") return "claimed";
	return "none";
}

// ---------------------------------------------------------------------------
// Expiry — two DIFFERENT sentinels for "never expires" depending on which
// type is in hand. Mixing these up renders a bogus 1970 date.
//
// - `StoredInvite.expiresAt: number` — `0` means never (same convention
//   `describeExpiry`, imported above, already implements for members/bots).
// - `InviteInspection.expiresAt: number | null` — `null` means never;
//   `0` is not a value the daemon produces here, but a defensive fallback
//   still routes it through the same never-expires logic rather than
//   rendering an epoch-zero date.
// ---------------------------------------------------------------------------

export type { ExpiryStatus };

/** `StoredInvite.expiresAt` (`0` = never) — re-exported call-through to `describeExpiry` so invite call sites don't reach into `space-settings.ts` for a member/bot-flavored name. */
export function describeInviteExpiry(expiresAtSeconds: number, nowMs: number = Date.now()): ExpiryStatus {
	return describeExpiry(expiresAtSeconds, nowMs);
}

/** `InviteInspection.expiresAt` (`null` = never) — see the module section doc comment for why this needs its own sentinel handling. */
export function describeInspectionExpiry(expiresAtSeconds: number | null, nowMs: number = Date.now()): ExpiryStatus {
	if (expiresAtSeconds === null) return { kind: "never" };
	return describeExpiry(expiresAtSeconds, nowMs);
}

// ---------------------------------------------------------------------------
// Revocation — `StoredInvite.revokedAt`: `0` means not revoked (same
// zero-sentinel shape as `expiresAt`, different meaning: a point-in-time
// event, not a threshold to compare against "now").
// ---------------------------------------------------------------------------

export type RevocationStatus = { kind: "active" } | { kind: "revoked"; date: Date };

export function describeRevocation(revokedAtSeconds: number): RevocationStatus {
	if (!Number.isFinite(revokedAtSeconds) || revokedAtSeconds <= 0) return { kind: "active" };
	return { kind: "revoked", date: new Date(revokedAtSeconds * 1000) };
}

// ---------------------------------------------------------------------------
// Redemption — `redeemedCount` starts at `0` (a real count, not "no
// data"); `multiUse: false` means the link stops working after its first
// redemption.
// ---------------------------------------------------------------------------

export type InviteRedemptionStatus =
	| { kind: "unused" }
	/** Single-use (`multiUse: false`) and already redeemed once — the link no longer works. */
	| { kind: "exhausted" }
	/** Multi-use, redeemed `count` times (`count > 0`). */
	| { kind: "active"; count: number };

export function describeRedemption(invite: Pick<StoredInvite, "multiUse" | "redeemedCount">): InviteRedemptionStatus {
	if (invite.redeemedCount <= 0) return { kind: "unused" };
	if (!invite.multiUse) return { kind: "exhausted" };
	return { kind: "active", count: invite.redeemedCount };
}

// ---------------------------------------------------------------------------
// Overall lifecycle state — drives the Invites-tab list row's status pill.
// Precedence: revoked beats expired beats exhausted beats active, since
// each of those is a strictly stronger "this link no longer works" fact.
// ---------------------------------------------------------------------------

export type InviteLifecycle = "active" | "exhausted" | "expired" | "revoked";

export function describeInviteLifecycle(invite: StoredInvite, nowMs: number = Date.now()): InviteLifecycle {
	if (describeRevocation(invite.revokedAt).kind === "revoked") return "revoked";
	if (describeInviteExpiry(invite.expiresAt, nowMs).kind === "expired") return "expired";
	if (describeRedemption(invite).kind === "exhausted") return "exhausted";
	return "active";
}

/** Whether sharing/copying this invite's link still makes sense. Revoked and expired links no longer work at all; an exhausted single-use link is also spent. */
export function isInviteLive(invite: StoredInvite, nowMs: number = Date.now()): boolean {
	return describeInviteLifecycle(invite, nowMs) === "active";
}

// ---------------------------------------------------------------------------
// Confirm-revoke slug — same "destructive actions need a typed slug"
// contract `memberConfirmSlug` / `botConfirmSlug` implement in
// `space-settings.ts`. Invites carry an optional `label`, so prefer that
// (the identity the owner themselves chose) and fall back to a short,
// stable slice of the opaque id.
// ---------------------------------------------------------------------------

export function inviteConfirmSlug(invite: Pick<StoredInvite, "id" | "label">): string {
	const label = invite.label.trim();
	return label.length > 0 ? label : invite.id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Invite creation — role + TTL preset inputs for the "Create invite" form.
// ---------------------------------------------------------------------------

/**
 * Roles an owner may hand out via an invite link. Deliberately excludes
 * `"bot"` (bots are added by pasting a peer address — ADR-0005 §4 — never
 * by invite link) and `"unspecified"` (not a real role, just the proto
 * enum's zero value).
 */
export const INVITE_ASSIGNABLE_ROLES: readonly SpaceRoleSlug[] = ["member", "editor", "viewer", "owner"];

export const INVITE_DEFAULT_ROLE: SpaceRoleSlug = "member";

/** Matches `CreateInviteArgs.ttlSecs`'s own convention: seconds from now, `0` = never. */
export type InviteTtlPreset = "1h" | "1d" | "7d" | "30d" | "never";

export const INVITE_TTL_PRESETS: readonly InviteTtlPreset[] = ["1h", "1d", "7d", "30d", "never"];

const HOUR_SECS = 60 * 60;
const DAY_SECS = HOUR_SECS * 24;

/** `CreateInviteArgs.ttlSecs`: "seconds from now until expiry. `0` means never expires." */
export function inviteTtlPresetToSeconds(preset: InviteTtlPreset): number {
	switch (preset) {
		case "1h":
			return HOUR_SECS;
		case "1d":
			return DAY_SECS;
		case "7d":
			return DAY_SECS * 7;
		case "30d":
			return DAY_SECS * 30;
		case "never":
			return 0;
		default: {
			const exhaustive: never = preset;
			throw new Error(`unreachable invite ttl preset: ${exhaustive}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Join decision outcome — `DomainEvent`'s `join-decision.decision` is the
// numeric `JoinDecisionType` from `proto/space/v1/membership.proto`:
// 0=unspecified, 1=approved, 2=rejected, 3=blocked. The redeem screen
// (`routes/join-space.tsx`) maps this to render the right outcome copy
// once the space owner (or an auto-approving bot) decides.
// ---------------------------------------------------------------------------

export type JoinDecisionOutcome = "approved" | "rejected" | "blocked" | "unknown";

export function describeJoinDecision(decisionCode: number): JoinDecisionOutcome {
	if (decisionCode === 1) return "approved";
	if (decisionCode === 2) return "rejected";
	if (decisionCode === 3) return "blocked";
	return "unknown";
}

// ---------------------------------------------------------------------------
// Deep-link handoff — routing an inbound `soma://invite/...` link to the
// join/confirmation screen. See `lib/deep-link.ts`, which wraps this in
// the `DeepLinkRoute` discrimination `components/deep-link/deep-link-listener.tsx`
// consumes.
// ---------------------------------------------------------------------------

/** Route path for the redeem/confirmation screen (`routes/join-space.tsx`). Absolute, for `navigate()`/`router.navigate()` call sites; `router.tsx` registers the matching relative child route (`"join"`) directly, same convention every sibling route in that file already follows. */
export const JOIN_SPACE_PATH = "/join";

/** Router `state` shape `JoinSpacePage` reads its pre-filled link from. */
export type JoinSpaceNavigationState = { link: string };

export function isInviteDeepLink(route: DeepLinkRoute): route is Extract<DeepLinkRoute, { kind: "invite" }> {
	return route.kind === "invite";
}
