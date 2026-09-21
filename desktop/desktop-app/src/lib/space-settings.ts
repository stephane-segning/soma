/**
 * Pure domain logic for the `spaces/:spaceId/settings` screen (Members +
 * Bots tabs). Kept side-effect-free and framework-free so it can be unit
 * tested under plain `vitest` (this package's `vitest.config.ts` runs
 * `environment: "node"` — no DOM, no React) rather than only exercised
 * indirectly through component tests.
 *
 * Every numeric convention mirrored here is load-bearing and comes from
 * the Rust side, not invented client-side — see each function's doc
 * comment for the exact backend source.
 */
import type { StoredJoinRequest, StoredSpaceBot } from "@soma/sdk";
import type { Bot } from "@soma/ui/components/lists/bot-list";

// ---------------------------------------------------------------------------
// Roles
//
// `SpaceRole` (proto/space/v1/membership.proto) is the canonical numeric
// enum: 0=unspecified, 1=owner, 2=editor, 3=viewer, 4=member, 5=bot. The
// renderer only ever sees the two shapes below — a numeric
// `StoredJoinRequest.requestedRole` and a lowercase string
// `StoredSpaceMember.role` (`backend/crates/membership/src/roles.rs`,
// `role_to_str`) — never the enum itself.
// ---------------------------------------------------------------------------

export type SpaceRoleSlug = "unspecified" | "owner" | "editor" | "viewer" | "member" | "bot";

const ROLE_BY_CODE: Record<number, SpaceRoleSlug> = {
	0: "unspecified",
	1: "owner",
	2: "editor",
	3: "viewer",
	4: "member",
	5: "bot",
};

const KNOWN_ROLE_SLUGS = new Set<SpaceRoleSlug>(["unspecified", "owner", "editor", "viewer", "member", "bot"]);

/**
 * Maps a `StoredJoinRequest.requestedRole` code to its slug. Mirrors the
 * server's own fallback for an unrecognized code —
 * `SpaceRole::try_from(role_i32).unwrap_or(SpaceRole::Member)` in
 * `backend/crates/membership/src/join_requests.rs` and
 * `join_decider/storage.rs` — so an out-of-range value degrades the same
 * way here as it would there.
 */
export function roleSlugFromCode(code: number): SpaceRoleSlug {
	return ROLE_BY_CODE[code] ?? "member";
}

/**
 * Normalizes a `StoredSpaceMember.role` string. The daemon always writes
 * one of the known lowercase slugs, but this stays defensive against a
 * future/unknown value reaching the client rather than rendering it raw.
 */
export function normalizeRoleSlug(role: string): SpaceRoleSlug {
	const lower = role.trim().toLowerCase();
	return KNOWN_ROLE_SLUGS.has(lower as SpaceRoleSlug) ? (lower as SpaceRoleSlug) : "member";
}

// ---------------------------------------------------------------------------
// Expiry
//
// `expiresAt` (StoredSpaceMember, StoredSpaceBot) and `createdAt`
// (StoredJoinRequest) are epoch **seconds**, not milliseconds — confirmed
// against `backend/crates/daemon/src/handle/issuer.rs::resolve_expires_at`
// ("epoch-seconds value") and the `now_secs` comparisons throughout
// `backend/crates/membership/src/join_request_persistence.rs`. `<= 0` is
// the daemon's own "no expiry" sentinel (`handle/members.rs`: "`expires_at:
// None` becomes `0`, the daemon's no-expiry convention").
// ---------------------------------------------------------------------------

export type ExpiryStatus = { kind: "never" } | { kind: "active"; date: Date } | { kind: "expired"; date: Date };

export function describeExpiry(expiresAtSeconds: number, nowMs: number = Date.now()): ExpiryStatus {
	if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) return { kind: "never" };
	const date = new Date(expiresAtSeconds * 1000);
	return date.getTime() <= nowMs ? { kind: "expired", date } : { kind: "active", date };
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

/**
 * `spaces.joinRequests()` returns every pending request across every
 * space the daemon knows about — the SDK has no per-space filter — so the
 * Members tab must narrow client-side before rendering.
 */
export function filterJoinRequestsBySpace(
	requests: readonly StoredJoinRequest[],
	spaceId: string,
): StoredJoinRequest[] {
	return requests.filter((request) => request.spaceId === spaceId);
}

// ---------------------------------------------------------------------------
// Peer ids / confirm slugs
// ---------------------------------------------------------------------------

/**
 * Mirrors `@soma/ui`'s `BotList` private `useTruncatedPeerId` exactly
 * (first 4 + last 4 chars) so a hand-rolled member `DenseRow` truncates
 * peer ids identically to a bot row.
 */
export function truncatePeerId(peerId: string): string {
	if (peerId.length <= 9) return peerId;
	return `${peerId.slice(0, 4)}…${peerId.slice(-4)}`;
}

/**
 * The token a user must retype to confirm revoking a member (ADR-0005 §3:
 * "destructive actions open an inline slug-confirm form"). Members carry
 * no alias, so the last 8 characters of their peer id stand in for a
 * slug — specific enough to that member, short enough to type.
 */
export function memberConfirmSlug(peerId: string): string {
	return peerId.length <= 8 ? peerId : peerId.slice(-8);
}

/**
 * Same idea for a bot, preferring its human alias — already the identity
 * surfaced in `@bot:<alias>` mentions — and otherwise falling back to the
 * same first-8-chars convention `toUiBot` below already uses for display.
 */
export function botConfirmSlug(bot: { alias: string | null; peerId: string }): string {
	const alias = bot.alias?.trim();
	return alias && alias.length > 0 ? alias : bot.peerId.slice(0, 8);
}

/** Case-sensitive on purpose — the whole point is deliberate, exact friction. */
export function slugMatches(typed: string, expected: string): boolean {
	return typed.trim() === expected;
}

// ---------------------------------------------------------------------------
// Bot list mapping — shared by the right-rail `BotsPanel` (read-only) and
// the Bots settings tab (management) so the two never drift apart.
// ---------------------------------------------------------------------------

export function asBotStatus(status: string): Bot["status"] {
	if (status === "active" || status === "pending" || status === "failed" || status === "expired") {
		return status;
	}
	return "pending";
}

export function toUiBot(stored: StoredSpaceBot): Bot {
	return {
		id: stored.peerId,
		alias: stored.alias ?? stored.peerId.slice(0, 8),
		peerId: stored.peerId,
		status: asBotStatus(stored.status),
	};
}

// ---------------------------------------------------------------------------
// Peer address parsing — Add-bot flow step 1 (ADR-0005 §4 / PRD refs §4).
// ---------------------------------------------------------------------------

export type PeerAddressParseResult =
	| { kind: "empty" }
	| { kind: "valid"; peerId: string; address: string }
	| { kind: "invalid"; reason: "missing-p2p-suffix" | "empty-peer-id" };

/**
 * Parses a pasted multiaddr and extracts the target peer id.
 *
 * Uses the **last** `/p2p/` segment, not the first: a circuit-relay
 * address has the shape `/ip4/.../p2p/<relay-id>/p2p-circuit/p2p/<target-id>`,
 * where the first `/p2p/` names the relay hop and only the final one
 * names the peer actually being authorized. Taking the first occurrence
 * (as the older `settings.tsx` network demo does) would silently grant
 * the capability to the relay instead of the intended bot.
 */
export function parsePeerAddress(raw: string): PeerAddressParseResult {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return { kind: "empty" };
	const marker = "/p2p/";
	const index = trimmed.lastIndexOf(marker);
	if (index === -1) return { kind: "invalid", reason: "missing-p2p-suffix" };
	const rest = trimmed.slice(index + marker.length);
	const peerId = (rest.split("/")[0] ?? "").trim();
	if (peerId.length === 0) return { kind: "invalid", reason: "empty-peer-id" };
	return { kind: "valid", peerId, address: trimmed };
}

// ---------------------------------------------------------------------------
// Expiry input conversion — Add-bot flow step 2 (`CapabilityForm`).
// ---------------------------------------------------------------------------

/**
 * Converts a `CapabilityFormValue.expiryDate` (an ISO `YYYY-MM-DD` string
 * from the form's date `<input>`, or `null` for its "Never" preset) into
 * the epoch-**seconds** `IssueIssuerCapabilityArgs.expiresAt` contract.
 *
 * `0` is deliberate, not "no value" — it's the exact sentinel
 * `resolve_expires_at` (`backend/crates/daemon/src/handle/issuer.rs`)
 * expects for "Never": the daemon resolves it to
 * `now + MAX_ISSUER_CAPABILITY_LIFETIME_SECS` server-side rather than
 * ever persisting a truly unbounded capability. An unparsable date also
 * degrades to `0` rather than throwing — the daemon still validates the
 * resolved value, so a bad client-side date can't smuggle through a
 * capability the server would otherwise reject.
 */
export function expiryDateToEpochSeconds(expiryDate: string | null): number {
	if (!expiryDate) return 0;
	const ms = new Date(`${expiryDate}T00:00:00`).getTime();
	if (Number.isNaN(ms)) return 0;
	return Math.floor(ms / 1000);
}
