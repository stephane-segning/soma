import type { InviteInspection, StoredInvite } from "@soma/sdk";
import { describe, expect, it } from "vitest";
import {
	describeInspectionExpiry,
	describeInviteExpiry,
	describeInviteLifecycle,
	describeJoinDecision,
	describeRedemption,
	describeRevocation,
	inviteConfirmSlug,
	inviteFieldTrust,
	inviteTtlPresetToSeconds,
	isInviteAcceptable,
	isInviteDeepLink,
	isInviteLive,
} from "./invites";

const NOW = new Date("2026-06-01T00:00:00.000Z").getTime();

function makeInvite(overrides: Partial<StoredInvite> = {}): StoredInvite {
	return {
		spaceId: "space-1",
		id: "invite-abc12345",
		link: "soma://invite/AbC123",
		issuerPeerId: "12D3KooWabc",
		role: "editor",
		expiresAt: 0,
		label: "",
		multiUse: false,
		createdAt: Math.floor(NOW / 1000) - 100,
		revokedAt: 0,
		redeemedCount: 0,
		...overrides,
	};
}

function makeInspection(overrides: Partial<InviteInspection> = {}): InviteInspection {
	return {
		validity: "valid",
		spaceId: "space-1",
		spaceLabel: "Design",
		role: "editor",
		issuerPeerId: "12D3KooWabc",
		expiresAt: null,
		bootstrapMultiaddrs: [],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// The security-critical gate: validity === "valid" is the ONLY thing that
// may enable the redeem confirmation screen's accept path.
// ---------------------------------------------------------------------------

describe("isInviteAcceptable", () => {
	it("is true only for validity 'valid'", () => {
		expect(isInviteAcceptable(makeInspection({ validity: "valid" }))).toBe(true);
	});

	it("is false for every other validity, even when fields are populated", () => {
		expect(isInviteAcceptable(makeInspection({ validity: "invalidSignature", role: "owner" }))).toBe(false);
		expect(isInviteAcceptable(makeInspection({ validity: "expired" }))).toBe(false);
		expect(isInviteAcceptable(makeInspection({ validity: "malformed", spaceId: null, role: null }))).toBe(false);
	});
});

describe("inviteFieldTrust", () => {
	it("treats valid and expired as verified (both are signature-valid)", () => {
		expect(inviteFieldTrust("valid")).toBe("verified");
		expect(inviteFieldTrust("expired")).toBe("verified");
	});

	it("treats invalidSignature fields as claims only, never facts", () => {
		expect(inviteFieldTrust("invalidSignature")).toBe("claimed");
	});

	it("treats malformed as carrying nothing", () => {
		expect(inviteFieldTrust("malformed")).toBe("none");
	});
});

// ---------------------------------------------------------------------------
// Expiry — two different "never" sentinels depending on the source type.
// ---------------------------------------------------------------------------

describe("describeInviteExpiry (StoredInvite.expiresAt, 0 = never)", () => {
	it("treats 0 as never", () => {
		expect(describeInviteExpiry(0, NOW)).toEqual({ kind: "never" });
	});

	it("treats a future timestamp as active", () => {
		const future = Math.floor(NOW / 1000) + 3600;
		expect(describeInviteExpiry(future, NOW)).toEqual({ kind: "active", date: new Date(future * 1000) });
	});

	it("treats a past timestamp as expired", () => {
		const past = Math.floor(NOW / 1000) - 3600;
		expect(describeInviteExpiry(past, NOW)).toEqual({ kind: "expired", date: new Date(past * 1000) });
	});
});

describe("describeInspectionExpiry (InviteInspection.expiresAt, null = never)", () => {
	it("treats null as never", () => {
		expect(describeInspectionExpiry(null, NOW)).toEqual({ kind: "never" });
	});

	it("does not treat 0 as a real 1970 date — defensively routes it through the never-expires path too", () => {
		expect(describeInspectionExpiry(0, NOW)).toEqual({ kind: "never" });
	});

	it("treats a future timestamp as active", () => {
		const future = Math.floor(NOW / 1000) + 3600;
		expect(describeInspectionExpiry(future, NOW)).toEqual({ kind: "active", date: new Date(future * 1000) });
	});

	it("treats a past timestamp as expired", () => {
		const past = Math.floor(NOW / 1000) - 3600;
		expect(describeInspectionExpiry(past, NOW)).toEqual({ kind: "expired", date: new Date(past * 1000) });
	});
});

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

describe("describeRevocation", () => {
	it("treats 0 as not revoked", () => {
		expect(describeRevocation(0)).toEqual({ kind: "active" });
	});

	it("treats a negative or non-finite value as not revoked", () => {
		expect(describeRevocation(-1)).toEqual({ kind: "active" });
		expect(describeRevocation(Number.NaN)).toEqual({ kind: "active" });
	});

	it("reports the revocation date for a positive timestamp", () => {
		expect(describeRevocation(1_700_000_000)).toEqual({ kind: "revoked", date: new Date(1_700_000_000 * 1000) });
	});
});

// ---------------------------------------------------------------------------
// Redemption — 0 is a real, meaningful count ("not redeemed yet"), not a
// missing-data marker.
// ---------------------------------------------------------------------------

describe("describeRedemption", () => {
	it("is unused when redeemedCount is 0, regardless of multiUse", () => {
		expect(describeRedemption({ multiUse: false, redeemedCount: 0 })).toEqual({ kind: "unused" });
		expect(describeRedemption({ multiUse: true, redeemedCount: 0 })).toEqual({ kind: "unused" });
	});

	it("is exhausted for a single-use invite redeemed once", () => {
		expect(describeRedemption({ multiUse: false, redeemedCount: 1 })).toEqual({ kind: "exhausted" });
	});

	it("carries the live count for a multi-use invite", () => {
		expect(describeRedemption({ multiUse: true, redeemedCount: 5 })).toEqual({ kind: "active", count: 5 });
	});
});

// ---------------------------------------------------------------------------
// Overall lifecycle precedence
// ---------------------------------------------------------------------------

describe("describeInviteLifecycle", () => {
	it("is active for a fresh, unredeemed, unexpired invite", () => {
		expect(describeInviteLifecycle(makeInvite(), NOW)).toBe("active");
	});

	it("is revoked even if also expired or exhausted", () => {
		const invite = makeInvite({
			revokedAt: Math.floor(NOW / 1000) - 10,
			expiresAt: Math.floor(NOW / 1000) - 20,
			multiUse: false,
			redeemedCount: 1,
		});
		expect(describeInviteLifecycle(invite, NOW)).toBe("revoked");
	});

	it("is expired when past expiresAt and not revoked", () => {
		const invite = makeInvite({ expiresAt: Math.floor(NOW / 1000) - 20 });
		expect(describeInviteLifecycle(invite, NOW)).toBe("expired");
	});

	it("is exhausted for a redeemed single-use invite that hasn't expired or been revoked", () => {
		const invite = makeInvite({ multiUse: false, redeemedCount: 1 });
		expect(describeInviteLifecycle(invite, NOW)).toBe("exhausted");
	});

	it("stays active for a multi-use invite with redemptions", () => {
		const invite = makeInvite({ multiUse: true, redeemedCount: 3 });
		expect(describeInviteLifecycle(invite, NOW)).toBe("active");
	});
});

describe("isInviteLive", () => {
	it("mirrors describeInviteLifecycle === 'active'", () => {
		expect(isInviteLive(makeInvite(), NOW)).toBe(true);
		expect(isInviteLive(makeInvite({ revokedAt: Math.floor(NOW / 1000) - 1 }), NOW)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Confirm-revoke slug
// ---------------------------------------------------------------------------

describe("inviteConfirmSlug", () => {
	it("prefers a trimmed label", () => {
		expect(inviteConfirmSlug({ id: "invite-abc12345", label: "  Design team  " })).toBe("Design team");
	});

	it("falls back to the first 8 chars of the id when there's no label", () => {
		expect(inviteConfirmSlug({ id: "invite-abc12345", label: "" })).toBe("invite-a");
		expect(inviteConfirmSlug({ id: "invite-abc12345", label: "   " })).toBe("invite-a");
	});
});

// ---------------------------------------------------------------------------
// TTL presets
// ---------------------------------------------------------------------------

describe("inviteTtlPresetToSeconds", () => {
	it("maps every preset to the expected seconds-from-now value", () => {
		expect(inviteTtlPresetToSeconds("1h")).toBe(3600);
		expect(inviteTtlPresetToSeconds("1d")).toBe(86_400);
		expect(inviteTtlPresetToSeconds("7d")).toBe(604_800);
		expect(inviteTtlPresetToSeconds("30d")).toBe(2_592_000);
	});

	it("maps 'never' to 0, matching CreateInviteArgs.ttlSecs's own never-expires sentinel", () => {
		expect(inviteTtlPresetToSeconds("never")).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Join decision outcome mapping (proto/space/v1/membership.proto JoinDecisionType)
// ---------------------------------------------------------------------------

describe("describeJoinDecision", () => {
	it("maps the known JoinDecisionType codes", () => {
		expect(describeJoinDecision(1)).toBe("approved");
		expect(describeJoinDecision(2)).toBe("rejected");
		expect(describeJoinDecision(3)).toBe("blocked");
	});

	it("maps unspecified (0) and any unrecognized code to unknown", () => {
		expect(describeJoinDecision(0)).toBe("unknown");
		expect(describeJoinDecision(99)).toBe("unknown");
		expect(describeJoinDecision(-1)).toBe("unknown");
	});
});

// ---------------------------------------------------------------------------
// Deep-link route narrowing
// ---------------------------------------------------------------------------

describe("isInviteDeepLink", () => {
	it("narrows an invite route", () => {
		const route = { kind: "invite" as const, link: "soma://invite/AbC123" };
		expect(isInviteDeepLink(route)).toBe(true);
	});

	it("rejects an unknown route", () => {
		const route = { kind: "unknown" as const, url: "soma://unsupported/x" };
		expect(isInviteDeepLink(route)).toBe(false);
	});
});
