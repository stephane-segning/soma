import type { StoredJoinRequest, StoredSpaceBot } from "@soma/sdk";
import { describe, expect, it } from "vitest";
import {
	asBotStatus,
	botConfirmSlug,
	describeExpiry,
	expiryDateToEpochSeconds,
	filterJoinRequestsBySpace,
	memberConfirmSlug,
	normalizeRoleSlug,
	parsePeerAddress,
	roleSlugFromCode,
	slugMatches,
	toUiBot,
	truncatePeerId,
} from "./space-settings";

describe("roleSlugFromCode", () => {
	it("maps every known SpaceRole proto code", () => {
		expect(roleSlugFromCode(0)).toBe("unspecified");
		expect(roleSlugFromCode(1)).toBe("owner");
		expect(roleSlugFromCode(2)).toBe("editor");
		expect(roleSlugFromCode(3)).toBe("viewer");
		expect(roleSlugFromCode(4)).toBe("member");
		expect(roleSlugFromCode(5)).toBe("bot");
	});

	it("falls back to member for an unrecognized code, mirroring the server", () => {
		expect(roleSlugFromCode(99)).toBe("member");
		expect(roleSlugFromCode(-1)).toBe("member");
	});
});

describe("normalizeRoleSlug", () => {
	it("passes through known lowercase role strings", () => {
		expect(normalizeRoleSlug("owner")).toBe("owner");
		expect(normalizeRoleSlug("editor")).toBe("editor");
	});

	it("lowercases and trims", () => {
		expect(normalizeRoleSlug(" Owner ")).toBe("owner");
		expect(normalizeRoleSlug("VIEWER")).toBe("viewer");
	});

	it("falls back to member for an unrecognized string", () => {
		expect(normalizeRoleSlug("superuser")).toBe("member");
		expect(normalizeRoleSlug("")).toBe("member");
	});
});

describe("describeExpiry", () => {
	const now = new Date("2026-01-01T00:00:00.000Z").getTime();

	it("treats 0 and negative values as never", () => {
		expect(describeExpiry(0, now)).toEqual({ kind: "never" });
		expect(describeExpiry(-1, now)).toEqual({ kind: "never" });
	});

	it("treats non-finite values as never", () => {
		expect(describeExpiry(Number.NaN, now)).toEqual({ kind: "never" });
	});

	it("reports a future timestamp as active", () => {
		const futureSeconds = now / 1000 + 3600;
		const result = describeExpiry(futureSeconds, now);
		expect(result.kind).toBe("active");
		expect(result.kind === "active" && result.date.getTime()).toBe(futureSeconds * 1000);
	});

	it("reports a past timestamp as expired", () => {
		const pastSeconds = now / 1000 - 3600;
		const result = describeExpiry(pastSeconds, now);
		expect(result.kind).toBe("expired");
	});

	it("treats exactly-now as expired (matches the daemon's <= comparison)", () => {
		const result = describeExpiry(now / 1000, now);
		expect(result.kind).toBe("expired");
	});
});

describe("filterJoinRequestsBySpace", () => {
	function request(overrides: Partial<StoredJoinRequest>): StoredJoinRequest {
		return {
			requestId: "req-1",
			spaceId: "space-a",
			subjectPeerId: "peer-1",
			displayName: "Alice",
			deviceName: "laptop",
			requestedRole: 4,
			createdAt: 0,
			...overrides,
		};
	}

	it("keeps only requests for the given space", () => {
		const requests = [
			request({ requestId: "r1", spaceId: "space-a" }),
			request({ requestId: "r2", spaceId: "space-b" }),
			request({ requestId: "r3", spaceId: "space-a" }),
		];
		const filtered = filterJoinRequestsBySpace(requests, "space-a");
		expect(filtered.map((r) => r.requestId)).toEqual(["r1", "r3"]);
	});

	it("returns an empty array when nothing matches", () => {
		const requests = [request({ spaceId: "space-b" })];
		expect(filterJoinRequestsBySpace(requests, "space-a")).toEqual([]);
	});
});

describe("truncatePeerId", () => {
	it("leaves short ids untouched", () => {
		expect(truncatePeerId("abc123")).toBe("abc123");
	});

	it("truncates long ids to first4…last4", () => {
		expect(truncatePeerId("12D3KooWAbCdEfGhIjKlMnOp")).toBe("12D3…MnOp");
	});
});

describe("memberConfirmSlug", () => {
	it("returns the whole id when it is 8 chars or shorter", () => {
		expect(memberConfirmSlug("abc123")).toBe("abc123");
		expect(memberConfirmSlug("12345678")).toBe("12345678");
	});

	it("returns the last 8 chars of a longer id", () => {
		expect(memberConfirmSlug("12D3KooWAbCdEfGhIjKlMnOp")).toBe("IjKlMnOp");
	});
});

describe("botConfirmSlug", () => {
	it("prefers the alias when present", () => {
		expect(botConfirmSlug({ alias: "my-bot", peerId: "12D3KooWAbCdEfGh" })).toBe("my-bot");
	});

	it("falls back to the first 8 chars of the peer id when alias is null or blank", () => {
		expect(botConfirmSlug({ alias: null, peerId: "12D3KooWAbCdEfGh" })).toBe("12D3KooW");
		expect(botConfirmSlug({ alias: "   ", peerId: "12D3KooWAbCdEfGh" })).toBe("12D3KooW");
	});
});

describe("slugMatches", () => {
	it("matches an exact, trimmed value", () => {
		expect(slugMatches("  abc123  ", "abc123")).toBe(true);
	});

	it("is case-sensitive", () => {
		expect(slugMatches("ABC123", "abc123")).toBe(false);
	});

	it("rejects an empty or partial value", () => {
		expect(slugMatches("", "abc123")).toBe(false);
		expect(slugMatches("abc12", "abc123")).toBe(false);
	});
});

describe("asBotStatus", () => {
	it("passes through known statuses", () => {
		expect(asBotStatus("active")).toBe("active");
		expect(asBotStatus("pending")).toBe("pending");
		expect(asBotStatus("failed")).toBe("failed");
		expect(asBotStatus("expired")).toBe("expired");
	});

	it("falls back to pending for an unrecognized status", () => {
		expect(asBotStatus("unknown")).toBe("pending");
	});
});

describe("toUiBot", () => {
	function bot(overrides: Partial<StoredSpaceBot>): StoredSpaceBot {
		return {
			spaceId: "space-a",
			peerId: "12D3KooWAbCdEfGh",
			expiresAt: 0,
			alias: null,
			status: "active",
			scopes: [],
			...overrides,
		};
	}

	it("uses the alias when present", () => {
		const result = toUiBot(bot({ alias: "my-bot" }));
		expect(result).toEqual({ id: "12D3KooWAbCdEfGh", alias: "my-bot", peerId: "12D3KooWAbCdEfGh", status: "active" });
	});

	it("falls back to the first 8 chars of the peer id when alias is null", () => {
		const result = toUiBot(bot({ alias: null }));
		expect(result.alias).toBe("12D3KooW");
	});
});

describe("parsePeerAddress", () => {
	it("treats blank input as empty, not invalid", () => {
		expect(parsePeerAddress("")).toEqual({ kind: "empty" });
		expect(parsePeerAddress("   ")).toEqual({ kind: "empty" });
	});

	it("rejects an address with no /p2p/ suffix", () => {
		expect(parsePeerAddress("/ip4/127.0.0.1/tcp/4001")).toEqual({
			kind: "invalid",
			reason: "missing-p2p-suffix",
		});
	});

	it("rejects a /p2p/ suffix with nothing after it", () => {
		expect(parsePeerAddress("/ip4/127.0.0.1/tcp/4001/p2p/")).toEqual({
			kind: "invalid",
			reason: "empty-peer-id",
		});
	});

	it("extracts the peer id from a direct address", () => {
		const address = "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWAbCdEfGh";
		expect(parsePeerAddress(address)).toEqual({ kind: "valid", peerId: "12D3KooWAbCdEfGh", address });
	});

	it("extracts the TARGET peer id (last /p2p/ segment) from a circuit-relay address", () => {
		const address = "/ip4/1.2.3.4/tcp/4001/p2p/12D3RelayPeerId/p2p-circuit/p2p/12D3TargetPeerId";
		expect(parsePeerAddress(address)).toEqual({
			kind: "valid",
			peerId: "12D3TargetPeerId",
			address,
		});
	});

	it("trims surrounding whitespace", () => {
		const address = "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWAbCdEfGh";
		expect(parsePeerAddress(`  ${address}  `)).toEqual({ kind: "valid", peerId: "12D3KooWAbCdEfGh", address });
	});

	it("stops the peer id at a trailing path segment", () => {
		const address = "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWAbCdEfGh/extra";
		expect(parsePeerAddress(address)).toEqual({ kind: "valid", peerId: "12D3KooWAbCdEfGh", address });
	});
});

describe("expiryDateToEpochSeconds", () => {
	it("maps null (the form's 'Never' preset) to the 0 sentinel", () => {
		expect(expiryDateToEpochSeconds(null)).toBe(0);
	});

	it("maps an empty string to 0 as well", () => {
		expect(expiryDateToEpochSeconds("")).toBe(0);
	});

	it("converts a YYYY-MM-DD date to local-midnight epoch seconds", () => {
		const expected = Math.floor(new Date("2026-03-15T00:00:00").getTime() / 1000);
		expect(expiryDateToEpochSeconds("2026-03-15")).toBe(expected);
	});

	it("degrades an unparsable date to 0 rather than throwing", () => {
		expect(expiryDateToEpochSeconds("not-a-date")).toBe(0);
	});
});
