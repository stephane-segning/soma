import { describe, expect, it } from "vitest";
import { formatRoleLabel, membershipSummary } from "./access-utils";

describe("formatRoleLabel", () => {
	it("maps known roles to readable labels", () => {
		expect(formatRoleLabel("owner")).toBe("Owner");
		expect(formatRoleLabel("editor")).toBe("Editor");
		expect(formatRoleLabel("bot")).toBe("Bot");
	});

	it("falls back for unknown roles", () => {
		expect(formatRoleLabel("mystery")).toBe("Unknown");
	});
});

describe("membershipSummary", () => {
	it("summarizes member counts and special cases", () => {
		expect(
			membershipSummary([
				{ peerId: "peer-1", role: "owner", expiresAt: 0 },
				{ peerId: "peer-2", role: "bot", expiresAt: 123 },
				{ peerId: "peer-3", role: "editor", expiresAt: 456 },
			]),
		).toBe("3 members - 1 owner - 1 bot - 2 expiring access grants");
	});

	it("handles empty rosters", () => {
		expect(membershipSummary([])).toBe("No members yet");
	});
});
