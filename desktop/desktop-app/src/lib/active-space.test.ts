import { describe, expect, it } from "vitest";
import { parseActiveSpaceId } from "./active-space";

describe("parseActiveSpaceId", () => {
	it("extracts the id from the space root route", () => {
		expect(parseActiveSpaceId("/spaces/abc123")).toBe("abc123");
	});

	it("extracts the id from a nested page route", () => {
		expect(parseActiveSpaceId("/spaces/abc123/pages/xyz789")).toBe("abc123");
	});

	it("extracts the id from other nested space routes (members, info)", () => {
		expect(parseActiveSpaceId("/spaces/abc123/members")).toBe("abc123");
		expect(parseActiveSpaceId("/spaces/abc123/info")).toBe("abc123");
	});

	it("handles a trailing slash with nothing after it", () => {
		expect(parseActiveSpaceId("/spaces/abc123/")).toBe("abc123");
	});

	it("returns null for the spaces index (no id segment)", () => {
		expect(parseActiveSpaceId("/spaces")).toBeNull();
		expect(parseActiveSpaceId("/spaces/")).toBeNull();
	});

	it("returns null for unrelated routes", () => {
		expect(parseActiveSpaceId("/settings")).toBeNull();
		expect(parseActiveSpaceId("/")).toBeNull();
		expect(parseActiveSpaceId("/spike/editor")).toBeNull();
	});

	it("decodes a URI-encoded id segment", () => {
		expect(parseActiveSpaceId("/spaces/space%20one/pages/p1")).toBe("space one");
	});
});
