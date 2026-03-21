import { describe, expect, it } from "vitest";
import { resolveSpacesEntryPath } from "./spaces-entry";

describe("resolveSpacesEntryPath", () => {
	it("routes an empty device to the landing screen", () => {
		expect(resolveSpacesEntryPath([])).toBe("/spaces/landing");
	});

	it("routes the first available space to its pages view", () => {
		expect(resolveSpacesEntryPath([{ spaceId: "space_alpha" }])).toBe("/spaces/space_alpha/pages");
	});
});
