/**
 * Deep-link → navigation handoff. Pure mapping from a `DeepLinkRoute`
 * (`backend.events.onDeepLink`'s payload — see `@soma/sdk`'s
 * `DeepLinkRoute` doc comment) to what the renderer should do about it.
 *
 * Kept framework-free (no router import, no React) so the actual
 * decision — "an invite link goes to the join screen, pre-filled;
 * anything else is logged, never silently dropped" — is unit-testable
 * without mounting a router. `components/deep-link/deep-link-listener.tsx`
 * is the thin component that subscribes to the event and calls this.
 */
import type { DeepLinkRoute } from "@soma/sdk";
import { JOIN_SPACE_PATH, type JoinSpaceNavigationState } from "./invites";

export type DeepLinkAction =
	| { kind: "navigate"; path: string; state: JoinSpaceNavigationState }
	| { kind: "ignore"; url: string };

/**
 * `kind: "invite"` lands on the join/confirmation screen with the link
 * pre-filled (`JoinSpacePage` reads `state.link`). `kind: "unknown"`
 * never crashes and never vanishes silently — the caller logs `url`.
 */
export function resolveDeepLinkAction(route: DeepLinkRoute): DeepLinkAction {
	if (route.kind === "invite") {
		return { kind: "navigate", path: JOIN_SPACE_PATH, state: { link: route.link } };
	}
	return { kind: "ignore", url: route.url };
}
