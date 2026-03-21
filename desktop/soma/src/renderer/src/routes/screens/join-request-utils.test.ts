import { describe, expect, it } from "vitest";
import { parseMultiaddrs, validateJoinDraft } from "./join-request-utils";

describe("parseMultiaddrs", () => {
	it("deduplicates and trims newline and comma separated values", () => {
		expect(parseMultiaddrs(" /ip4/1/tcp/2 ,\n/ip4/1/tcp/2\n/dns4/example/tcp/443 ")).toEqual([
			"/ip4/1/tcp/2",
			"/dns4/example/tcp/443",
		]);
	});
});

describe("validateJoinDraft", () => {
	it("requires a space id first", () => {
			expect(
				validateJoinDraft({
					spaceId: "",
				targetPeerId: "peer-1",
				targetMultiaddrs: "/ip4/1/tcp/2",
				displayName: "",
				deviceName: "",
			}),
		).toBe("Add the space ID you were invited to.");
	});

	it("requires an approver peer id", () => {
		expect(
			validateJoinDraft({
				spaceId: "space-1",
				targetPeerId: "",
				targetMultiaddrs: "/ip4/1/tcp/2",
				displayName: "",
				deviceName: "",
			}),
		).toBe("Add the peer ID for the owner or delegated approver for this space.");
	});

	it("requires at least one network address", () => {
		expect(
			validateJoinDraft({
				spaceId: "space-1",
				targetPeerId: "peer-1",
				targetMultiaddrs: "   ",
				displayName: "",
				deviceName: "",
			}),
		).toBe("Add at least one network address so Soma knows where to send the request.");
	});

	it("accepts a complete draft", () => {
		expect(
			validateJoinDraft({
				spaceId: "space-1",
				targetPeerId: "peer-1",
				targetMultiaddrs: "/ip4/1/tcp/2",
				displayName: "Alex",
				deviceName: "Laptop",
			}),
		).toBeNull();
	});
});
