import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
	it("joins truthy class fragments", () => {
		expect(cn("a", "b")).toBe("a b");
	});

	it("drops falsy values", () => {
		expect(cn("a", null, undefined, false, "b")).toBe("a b");
	});

	it("dedupes conflicting tailwind utilities (last wins)", () => {
		expect(cn("p-2", "p-4")).toBe("p-4");
		expect(cn("text-sm", "text-base")).toBe("text-base");
	});

	it("merges conditional class objects", () => {
		expect(cn("base", { active: true, disabled: false })).toBe("base active");
	});
});
