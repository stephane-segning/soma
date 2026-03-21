import { describe, expect, it } from "vitest";
import { describeRole, formatRoleLabel, membershipSummary, requestedAccessLevelLabel, roleOptions } from "./access-utils";

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

describe("describeRole", () => {
	it("explains member and bot roles in plain language", () => {
		expect(describeRole("member")).toContain("General workspace access");
		expect(describeRole("bot")).toContain("Non-human peer");
	});
});

describe("roleOptions", () => {
	it("keeps normal human roles first and warnings on exceptional roles", () => {
		const options = roleOptions();
		expect(options.map((option) => option.value)).toEqual(["editor", "viewer", "member", "owner", "bot"]);
		expect(options.find((option) => option.value === "owner")?.warning).toContain("full workspace control");
	});
});

describe("requestedAccessLevelLabel", () => {
	it("maps known numeric values to readable labels", () => {
		expect(requestedAccessLevelLabel(2)).toBe("Editor");
		expect(requestedAccessLevelLabel(5)).toBe("Bot");
		expect(requestedAccessLevelLabel(99)).toBe("Member");
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
