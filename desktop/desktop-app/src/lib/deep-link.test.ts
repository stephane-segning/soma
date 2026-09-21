import { describe, expect, it } from "vitest";
import { resolveDeepLinkAction } from "./deep-link";
import { JOIN_SPACE_PATH } from "./invites";

describe("resolveDeepLinkAction", () => {
	it("routes an invite deep link to the join screen with the link pre-filled", () => {
		const action = resolveDeepLinkAction({ kind: "invite", link: "soma://invite/AbC123" });
		expect(action).toEqual({ kind: "navigate", path: JOIN_SPACE_PATH, state: { link: "soma://invite/AbC123" } });
	});

	it("never navigates for an unknown deep link, but never drops it silently either", () => {
		const action = resolveDeepLinkAction({ kind: "unknown", url: "soma://unsupported/x" });
		expect(action).toEqual({ kind: "ignore", url: "soma://unsupported/x" });
	});
});
